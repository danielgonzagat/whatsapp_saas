import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { UnifiedAgentService } from './unified-agent.service';
import { SmartPaymentService } from './smart-payment.service';
import { chatCompletionWithFallback } from './openai-wrapper';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import { KLOEL_SALES_PROMPT } from './kloel.prompts';
import {
  NON_DIGIT_RE,
  safeStr,
  asUnknownRecord,
  detectBuyIntent,
  getOrCreateLead,
  getLeadConversationHistory,
  saveLeadMessage,
  updateLeadFromConversation,
  extractProductFromMessage,
  ChatMessage,
} from './kloel-lead-processor-helpers';
import OpenAI from 'openai';
import { OpsAlertService } from '../observability/ops-alert.service';

export interface FollowupListItem {
  id: string;
  key: string;
  phone?: unknown;
  contactId?: unknown;
  message: unknown;
  scheduledFor?: unknown;
  delayMinutes?: unknown;
  status: unknown;
  createdAt: Date;
  executedAt?: unknown;
}

/** Handles WhatsApp message processing, lead lifecycle, and follow-ups. */
@Injectable()
export class KloelLeadProcessorService {
  private readonly logger = new Logger(KloelLeadProcessorService.name);
  private readonly openai: OpenAI;

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappService: WhatsappService,
    private readonly unifiedAgentService: UnifiedAgentService,
    private readonly smartPaymentService: SmartPaymentService,
    private readonly planLimits: PlanLimitsService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async processWhatsAppMessage(
    workspaceId: string,
    senderPhone: string,
    message: string,
    getWorkspaceContextFn: (workspaceId: string) => Promise<string>,
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

      const lead = await getOrCreateLead(
        this.prisma,
        this.logger,
        workspaceId,
        normalizedPhone || senderPhone,
      );
      await saveLeadMessage(this.prisma, this.logger, lead.id, 'user', message);

      let contactId: string | null = null;
      try {
        if (normalizedPhone) {
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
        }
      } catch (err: unknown) {
        void this.opsAlert?.alertOnCriticalError(err, 'KloelLeadProcessorService.slice');
        const msg = err instanceof Error ? err.message : 'unknown error';
        this.logger.warn(`Falha ao upsert contact: ${msg}`);
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
          await saveLeadMessage(this.prisma, this.logger, lead.id, 'assistant', agentResponse);
          await updateLeadFromConversation(this.prisma, this.logger, workspaceId, lead.id, message);
          return agentResponse;
        } catch (agentErr: unknown) {
          void this.opsAlert?.alertOnCriticalError(
            agentErr,
            'KloelLeadProcessorService.updateLeadFromConversation',
          );
          const msg = agentErr instanceof Error ? agentErr.message : 'unknown error';
          this.logger.warn(`UnifiedAgentService falhou: ${msg}`);
        }
      }

      const conversationHistory = await getLeadConversationHistory(this.prisma, lead.id);
      const context = await getWorkspaceContextFn(workspaceId);
      const salesSystemPrompt = KLOEL_SALES_PROMPT(workspace?.name || 'nossa empresa', context);
      const messages: ChatMessage[] = [
        { role: 'system', content: salesSystemPrompt },
        ...conversationHistory,
        { role: 'user', content: message },
      ];

      if (workspaceId) await this.planLimits.ensureTokenBudget(workspaceId);
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
      if (workspaceId)
        await this.planLimits
          .trackAiUsage(workspaceId, response?.usage?.total_tokens ?? 500)
          .catch(() => {});

      const kloelResponse =
        response.choices[0]?.message?.content || 'Olá! Como posso ajudá-lo hoje?';
      await saveLeadMessage(this.prisma, this.logger, lead.id, 'assistant', kloelResponse);
      await updateLeadFromConversation(this.prisma, this.logger, workspaceId, lead.id, message);
      return kloelResponse;
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(
        error,
        'KloelLeadProcessorService.updateLeadFromConversation',
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
    getWorkspaceContextFn: (workspaceId: string) => Promise<string>,
  ): Promise<{ response: string; paymentLink?: string; pixQrCode?: string }> {
    const baseResponse = await this.processWhatsAppMessage(
      workspaceId,
      senderPhone,
      message,
      getWorkspaceContextFn,
    );
    const buyIntent = detectBuyIntent(message);
    if (buyIntent === 'high') {
      const productMention = await extractProductFromMessage(this.prisma, workspaceId, message);
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
        'KloelLeadProcessorService.generatePaymentForLead',
      );
      const msg = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`Erro ao gerar pagamento para lead: ${msg}`);
      return null;
    }
  }

  async listFollowups(
    workspaceId: string,
    contactId?: string,
  ): Promise<{ total: number; followups: FollowupListItem[] }> {
    try {
      const whereClause: Prisma.KloelMemoryWhereInput = { workspaceId, category: 'followups' };
      if (contactId) {
        whereClause.metadata = { path: ['contactId'], equals: contactId };
      }
      const followups = await this.prisma.kloelMemory.findMany({
        where: { ...whereClause, workspaceId },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: { id: true, key: true, value: true, metadata: true, createdAt: true },
      });
      return {
        total: followups.length,
        followups: followups.map((f): FollowupListItem => {
          const meta = (f.metadata as Record<string, unknown>) || {};
          return {
            id: f.id,
            key: f.key,
            phone: meta.phone,
            contactId: meta.contactId,
            message: meta.message || f.value,
            scheduledFor: meta.scheduledFor,
            delayMinutes: meta.delayMinutes,
            status: meta.status || 'pending',
            createdAt: f.createdAt,
            executedAt: meta.executedAt,
          };
        }),
      };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'KloelLeadProcessorService.meta');
      const msg = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`Erro ao listar follow-ups: ${msg}`);
      return { total: 0, followups: [] };
    }
  }

  detectBuyIntent(message: string): 'high' | 'medium' | 'low' | 'objection' {
    return detectBuyIntent(message);
  }
}
