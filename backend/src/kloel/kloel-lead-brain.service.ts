import { Injectable, Logger, Optional } from '@nestjs/common';
import { KloelLead, Prisma } from '@prisma/client';
import { LLMBudgetService, estimateChatCostCents } from './llm-budget.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { PrismaService } from '../prisma/prisma.service';
import { UnifiedAgentService } from './unified-agent.service';
import { SmartPaymentService } from './smart-payment.service';
import { chatCompletionWithFallback } from './openai-wrapper';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import { KLOEL_SALES_PROMPT } from './kloel.prompts';
import OpenAI from 'openai';
import { OpsAlertService } from '../observability/ops-alert.service';

import {
  NON_DIGIT_RE,
  safeStr,
  asUnknownRecord,
  detectBuyIntent,
} from './__companions__/kloel-lead-brain.service.companion';
import type { ChatMessage } from './__companions__/kloel-lead-brain.service.companion';
export { NON_DIGIT_RE, safeStr, asUnknownRecord, detectBuyIntent };
export type { ChatMessage };

/**
 * Handles WhatsApp autopilot lead processing, buy-intent detection,
 * and payment generation for inbound leads.
 */
@Injectable()
export class KloelLeadBrainService {
  private readonly logger = new Logger(KloelLeadBrainService.name);
  private readonly openai: OpenAI;

  constructor(
    private readonly prisma: PrismaService,
    private readonly planLimits: PlanLimitsService,
    private readonly llmBudget: LLMBudgetService,
    private readonly unifiedAgentService: UnifiedAgentService,
    private readonly smartPaymentService: SmartPaymentService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 60_000,
      maxRetries: 0,
    });
  }

  async getOrCreateLead(workspaceId: string, phone: string): Promise<KloelLead> {
    let lead = await this.prisma.kloelLead.findFirst({ where: { workspaceId, phone } });
    if (!lead) {
      lead = await this.prisma.kloelLead.create({
        data: { workspaceId, phone, name: `Lead ${phone.slice(-4)}`, stage: 'new', score: 0 },
      });
      this.logger.log(`Novo lead criado: ${lead.id}`);
    }
    return lead;
  }

  private async getLeadConversationHistory(
    leadId: string,
    workspaceId: string,
  ): Promise<ChatMessage[]> {
    try {
      const messages = await this.prisma.kloelConversation.findMany({
        where: { lead: { id: leadId, workspaceId } },
        orderBy: { createdAt: 'asc' },
        take: 30,
        select: { role: true, content: true },
      });
      return messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
    } catch (_error: unknown) {
      return [];
    }
  }

  async saveLeadMessage(
    leadId: string,
    workspaceId: string,
    role: string,
    content: string,
  ): Promise<void> {
    try {
      // Validate lead ownership before creating conversation
      const lead = await this.prisma.kloelLead.findUnique({
        where: { id: leadId, workspaceId },
        select: { id: true },
      });
      if (!lead) {
        return;
      }
      await this.prisma.kloelConversation.create({ data: { leadId, role, content } });
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'KloelLeadBrainService.create');
      this.logger.warn('Erro ao salvar mensagem do lead:', error); // Intencional: lead message persistence is non-critical.
    }
  }

  async updateLeadFromConversation(
    workspaceId: string,
    leadId: string,
    userMessage: string,
    _assistantResponse: string,
  ): Promise<void> {
    try {
      const buyIntent = detectBuyIntent(userMessage);
      const updateData: Prisma.KloelLeadUpdateManyMutationInput = {
        lastMessage: userMessage,
        lastIntent: buyIntent,
        updatedAt: new Date(),
      };
      if (buyIntent === 'high') {
        updateData.score = { increment: 20 };
        updateData.stage = 'negotiation';
      } else if (buyIntent === 'medium') {
        updateData.score = { increment: 10 };
        updateData.stage = 'interested';
      } else if (buyIntent === 'objection') {
        updateData.stage = 'objection';
      }
      await this.prisma.kloelLead.updateMany({
        where: { id: leadId, workspaceId },
        data: updateData,
      });
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'KloelLeadBrainService.updateMany');
      this.logger.warn('Erro ao atualizar lead:', error); // Intencional: lead update failure is non-critical.
    }
  }

  async extractProductFromMessage(
    workspaceId: string,
    message: string,
  ): Promise<{ name: string; price: number } | null> {
    try {
      const products = await this.prisma.kloelMemory.findMany({
        where: { workspaceId, type: 'product' },
        select: { id: true, value: true },
        take: 100,
      });
      const lowerMessage = message.toLowerCase();
      for (const product of products) {
        const productData = product.value as Record<string, unknown>;
        const productName = safeStr(productData.name).toLowerCase();
        if (productName && lowerMessage.includes(productName)) {
          return { name: safeStr(productData.name), price: Number(productData.price) || 0 };
        }
      }
      const dbProducts = await this.prisma.product
        ?.findMany?.({
          where: { workspaceId, active: true },
          select: { id: true, name: true, price: true },
          take: 100,
        })
        .catch(() => []);
      for (const product of dbProducts || []) {
        if (lowerMessage.includes(product.name.toLowerCase())) {
          return { name: product.name, price: product.price };
        }
      }
      return null;
    } catch (_error: unknown) {
      void this.opsAlert?.alertOnCriticalError(_error, 'KloelLeadBrainService.safeStr');
      return null;
    }
  }

  async generatePaymentForLead(
    workspaceId: string,
    leadId: string,
    phone: string,
    productName: string,
    amount: number,
    conversation: string,
  ): Promise<{ paymentUrl: string; pixQrCode?: string; message: string } | null> {
    try {
      const lead = await this.prisma.kloelLead.findFirst({ where: { id: leadId, workspaceId } });
      const result = await this.smartPaymentService.createSmartPayment({
        workspaceId,
        contactId: leadId,
        phone,
        customerName: lead?.name || 'Cliente',
        productName,
        amount,
        conversation,
      });
      this.logger.log(`Pagamento gerado para lead ${leadId}: ${result.paymentUrl}`);
      return {
        paymentUrl: result.paymentUrl,
        pixQrCode: result.pixQrCode,
        message: result.suggestedMessage,
      };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(
        error,
        'KloelLeadBrainService.generatePaymentForLead',
      );
      const msg = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`Erro ao gerar pagamento para lead: ${msg}`);
      return null;
    }
  }

  async processWhatsAppMessage(
    workspaceId: string,
    senderPhone: string,
    message: string,
    getWorkspaceContext: (workspaceId: string, userId?: string) => Promise<string>,
  ): Promise<string> {
    this.logger.log(`KLOEL processando mensagem de ${senderPhone}`);
    try {
      const normalizedPhone = String(senderPhone || '').replace(NON_DIGIT_RE, '');
      const workspace = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { providerSettings: true, name: true },
      });
      const providerSettings = (workspace?.providerSettings ?? {}) as Record<string, unknown>;
      const autonomyMode = safeStr(asUnknownRecord(providerSettings.autonomy)?.mode).toUpperCase();
      const autopilotEnabled =
        autonomyMode === 'LIVE' ||
        autonomyMode === 'BACKLOG' ||
        autonomyMode === 'FULL' ||
        asUnknownRecord(providerSettings.autopilot)?.enabled === true ||
        providerSettings.autopilotEnabled === true;

      const lead = await this.getOrCreateLead(workspaceId, normalizedPhone || senderPhone);
      await this.saveLeadMessage(lead.id, workspaceId, 'user', message);

      let contactId: string | null = null;
      if (normalizedPhone) {
        try {
          const contact = await this.prisma.contact.upsert({
            where: { workspaceId_phone: { workspaceId, phone: normalizedPhone } },
            update: {},
            create: {
              workspaceId,
              phone: normalizedPhone,
              name: `Contato ${normalizedPhone.slice(-4)}`,
            },
            select: { id: true },
          });
          contactId = contact.id;
        } catch (err: unknown) {
          void this.opsAlert?.alertOnCriticalError(err, 'KloelLeadBrainService.slice');
          const errMsg = err instanceof Error ? err.message : 'unknown error';
          this.logger.warn(`Falha ao upsert contact: ${errMsg}`);
        }
      }

      if (autopilotEnabled) {
        try {
          const unifiedResult = await this.unifiedAgentService.processIncomingMessage({
            workspaceId,
            contactId: contactId || undefined,
            phone: normalizedPhone || senderPhone,
            message,
            channel: 'whatsapp',
          });
          const agentResponse =
            unifiedResult?.reply || unifiedResult?.response || 'Olá! Como posso ajudar?';
          await this.saveLeadMessage(lead.id, workspaceId, 'assistant', agentResponse);
          await this.updateLeadFromConversation(workspaceId, lead.id, message, agentResponse);
          return agentResponse;
        } catch (agentErr: unknown) {
          void this.opsAlert?.alertOnCriticalError(
            agentErr,
            'KloelLeadBrainService.updateLeadFromConversation',
          );
          const agentMsg = agentErr instanceof Error ? agentErr.message : 'unknown error';
          this.logger.warn(`UnifiedAgentService falhou: ${agentMsg}`);
        }
      }

      const conversationHistory = await this.getLeadConversationHistory(lead.id, workspaceId);
      const context = await getWorkspaceContext(workspaceId);
      const salesSystemPrompt = KLOEL_SALES_PROMPT(workspace?.name || 'nossa empresa', context);
      const messages: ChatMessage[] = [
        { role: 'system', content: salesSystemPrompt },
        ...conversationHistory,
        { role: 'user', content: message },
      ];

      await this.planLimits.ensureTokenBudget(workspaceId);
      const estimatedCostCents = estimateChatCostCents({
        inputChars: JSON.stringify(messages).length,
        maxOutputTokens: 1000,
      });
      await this.llmBudget.assertBudget(workspaceId, estimatedCostCents);
      const response = await chatCompletionWithFallback(
        this.openai,
        {
          model: resolveBackendOpenAIModel('writer'),
          messages,
          temperature: 0.7,
          max_tokens: 1000,
        },
        resolveBackendOpenAIModel('writer_fallback'),
      );
      await this.llmBudget
        .recordSpend(workspaceId, response?.usage?.total_tokens ?? 0)
        .catch(() => {});
      await this.planLimits
        .trackAiUsage(workspaceId, response?.usage?.total_tokens ?? 500)
        .catch(() => {});

      const kloelResponse =
        response.choices[0]?.message?.content || 'Olá! Como posso ajudá-lo hoje?';
      await this.saveLeadMessage(lead.id, workspaceId, 'assistant', kloelResponse);
      await this.updateLeadFromConversation(workspaceId, lead.id, message, kloelResponse);
      return kloelResponse;
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(
        error,
        'KloelLeadBrainService.updateLeadFromConversation',
      );
      const msg = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`Erro processando mensagem WhatsApp: ${msg}`);
      return 'Olá! Tive um pequeno problema técnico. Pode repetir sua mensagem?';
    }
  }

  async processWhatsAppMessageWithPayment(
    workspaceId: string,
    senderPhone: string,
    message: string,
    getWorkspaceContext: (workspaceId: string, userId?: string) => Promise<string>,
  ): Promise<{ response: string; paymentLink?: string; pixQrCode?: string }> {
    const baseResponse = await this.processWhatsAppMessage(
      workspaceId,
      senderPhone,
      message,
      getWorkspaceContext,
    );
    const buyIntent = detectBuyIntent(message);
    if (buyIntent === 'high') {
      const productMention = await this.extractProductFromMessage(workspaceId, message);
      if (productMention) {
        const lead = await this.prisma.kloelLead.findFirst({
          where: { workspaceId, phone: senderPhone },
        });
        if (lead) {
          const paymentResult = await this.generatePaymentForLead(
            workspaceId,
            lead.id,
            senderPhone,
            productMention.name,
            productMention.price,
            message,
          );
          if (paymentResult) {
            return {
              response: `${baseResponse}\n\nAqui está o link para finalizar sua compra:\n${paymentResult.paymentUrl}`,
              paymentLink: paymentResult.paymentUrl,
              pixQrCode: paymentResult.pixQrCode,
            };
          }
        }
      }
    }
    return { response: baseResponse };
  }
}
