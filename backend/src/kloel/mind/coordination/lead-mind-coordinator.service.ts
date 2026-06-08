/**
 * LeadMindCoordinator — canonical per-lead cognitive coordinator
 * (ADR-0013 Wave M1).
 *
 * Handles WhatsApp autopilot lead processing, buy-intent detection, and
 * payment generation for inbound leads.
 *
 * Legacy alias: `KloelLeadBrainService` (export below) from
 * `backend/src/kloel/kloel-lead-brain.service.ts` — kept for the 4-week
 * alias window before deletion.
 *
 * @cluster Mind/Coordination
 * @see docs/adr/0013-kloel-mind-unification.md
 */
import { Inject, Injectable, Optional, forwardRef } from '@nestjs/common';
import { StructuredLogger } from '../../../logging/structured-logger';
import { KloelLead } from '@prisma/client';
import { LLMBudgetService, estimateChatCostCents } from '../../llm-budget.service';
import { PlanLimitsService } from '../../../billing/plan-limits.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { dualWriteLeadConversationMindMessage } from '../../kloel-lead-processor-helpers';
import { UnifiedAgentService } from '../../unified-agent.service';
import { SmartPaymentService } from '../../smart-payment.service';
import { chatCompletionWithFallback } from '../../openai-wrapper';
import { createTextLlmClient } from '../../../lib/llm-provider';
import { resolveBackendOpenAIModel } from '../../../lib/openai-models';
import OpenAI from 'openai';
import { OpsAlertService } from '../../../observability/ops-alert.service';
import { AbiBuilderService } from '../../abi/abi-builder.service';
import { validateAbiPayload } from '../../abi/abi-validator';
import { normalizePhone } from '../../../common/phone/phone-normalization.util';
import {
  NON_DIGIT_RE,
  safeStr,
  asUnknownRecord,
  detectBuyIntent,
} from '../../kloel-lead-brain.helpers';
import type { ChatMessage } from '../../kloel-lead-brain.helpers';
import {
  LEAD_TECH_ERROR_REPLY,
  buildAbiCognitiveContent,
  buildContactDisplayName,
  buildFallbackCognitiveContent,
  buildLeadUpdateData,
  buildNewLeadName,
  findProductMatch,
  formatPaymentReply,
  isAutopilotEnabled,
  isShortLlmOutput,
  leadErrorMessage,
  pickKloelReply,
  pickUnifiedAgentReply,
  productCandidateFromMemory,
  type ProductMatchCandidate,
  type ProductMemoryValue,
} from './lead-mind-coordinator.helpers';
import { MindMemoryItemService } from '../aliases/mind-memory-item.service';

export { NON_DIGIT_RE, safeStr, asUnknownRecord, detectBuyIntent };
export type { ChatMessage };

/**
 * Per-lead cognitive coordinator. Handles WhatsApp autopilot lead processing,
 * buy-intent detection, and payment generation for inbound leads.
 */
@Injectable()
export class LeadMindCoordinator {
  private readonly logger = StructuredLogger.from(LeadMindCoordinator.name);
  private readonly openai: OpenAI;

  constructor(
    private readonly prisma: PrismaService,
    private readonly planLimits: PlanLimitsService,
    private readonly llmBudget: LLMBudgetService,
    @Inject(forwardRef(() => UnifiedAgentService))
    private readonly unifiedAgentService: UnifiedAgentService,
    private readonly smartPaymentService: SmartPaymentService,
    @Optional() private readonly opsAlert?: OpsAlertService,
    @Optional() private readonly abiBuilder?: AbiBuilderService,
    @Optional() private readonly mindMemory?: MindMemoryItemService,
  ) {
    this.openai =
      createTextLlmClient(undefined, { timeout: 60_000, maxRetries: 0 }) ??
      new OpenAI({ apiKey: 'missing' });
  }

  /** Canonical Brain → Mind memory delegate (raw-Prisma fallback). */
  private get mindMemoryItems(): PrismaService['kloelMemory'] {
    return this.mindMemory?.items ?? this.prisma.kloelMemory;
  }

  async getOrCreateLead(workspaceId: string, phone: string): Promise<KloelLead> {
    let lead = await this.prisma.kloelLead.findFirst({ where: { workspaceId, phone } });
    if (!lead) {
      lead = await this.prisma.kloelLead.create({
        data: {
          workspaceId,
          phone,
          name: buildNewLeadName(phone),
          stage: 'new',
          score: 0,
        },
      });
      this.logger.log(`Novo lead criado: ${lead.id}`);
    }
    // Canonical bridge (Wave5 L7 / PERSON migration PHASE 1): keep Contact as
    // the single source of truth for the person behind a KloelLead. Reuses the
    // canonical workspaceId_phone upsert shape (same as CrmService.upsertContact)
    // and mirrors the lead funnel snapshot additively. Idempotent + fail-open.
    await this.syncCanonicalContact(workspaceId, phone, lead);
    return lead;
  }

  /**
   * Upsert the canonical Contact for a lead's phone so Contact stays the single
   * source of truth for the person. Idempotent (upsert on workspaceId_phone),
   * workspace-isolated, and fail-open — a Contact sync failure must never break
   * lead processing.
   *
   * PERSON migration PHASE 1 dual-write: mirrors the lead funnel snapshot
   * (status/stage/lastMessage/lastIntent/totalMessages) onto the Contact and
   * stamps `kloelLeadId` write-if-null so the first lead that produced a Contact
   * keeps provenance without ever overwriting an existing link.
   */
  private async syncCanonicalContact(
    workspaceId: string,
    phone: string,
    lead: KloelLead,
  ): Promise<void> {
    const normalizedPhone = normalizePhone(phone)?.digits;
    if (!normalizedPhone) {
      return;
    }
    try {
      const existing = await this.prisma.contact.findUnique({
        where: { workspaceId_phone: { workspaceId, phone: normalizedPhone } },
        select: { kloelLeadId: true },
      });
      const funnel = {
        leadStatus: lead.status,
        leadStage: lead.stage,
        lastMessage: lead.lastMessage,
        lastIntent: lead.lastIntent,
        totalMessages: lead.totalMessages,
      };
      await this.prisma.contact.upsert({
        where: { workspaceId_phone: { workspaceId, phone: normalizedPhone } },
        update: {
          ...funnel,
          ...(existing && existing.kloelLeadId === null ? { kloelLeadId: lead.id } : {}),
        },
        create: {
          workspaceId,
          phone: normalizedPhone,
          name: buildContactDisplayName(normalizedPhone),
          ...funnel,
          kloelLeadId: lead.id,
        },
        select: { id: true },
      });
    } catch (err: unknown) {
      void this.opsAlert?.alertOnCriticalError(err, 'LeadMindCoordinator.syncCanonicalContact');
      this.logger.warn(`Falha ao sincronizar contato canônico: ${leadErrorMessage(err)}`);
    }
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
      return messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
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
      // Canonical Brain->Mind mirror (source: 'lead_conversation'), flag-gated
      // (KLOEL_MINDMESSAGE_DUALWRITE, default OFF) + fail-open. Only runs after a
      // successful KloelConversation write (lead ownership already validated above).
      await dualWriteLeadConversationMindMessage(
        this.prisma,
        this.logger,
        workspaceId,
        role,
        content,
      );
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'LeadMindCoordinator.create');
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
      const updateData = buildLeadUpdateData(userMessage, buyIntent);
      await this.prisma.kloelLead.updateMany({
        where: { id: leadId, workspaceId },
        data: updateData,
      });
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'LeadMindCoordinator.updateMany');
      this.logger.warn('Erro ao atualizar lead:', error); // Intencional: lead update failure is non-critical.
    }
  }

  async extractProductFromMessage(
    workspaceId: string,
    message: string,
  ): Promise<ProductMatchCandidate | null> {
    try {
      const memoryRows = await this.mindMemoryItems.findMany({
        where: { workspaceId, type: 'product' },
        select: { id: true, value: true },
        take: 100,
      });
      const memoryCandidates: ProductMatchCandidate[] = memoryRows
        .map((row) => productCandidateFromMemory(row.value as ProductMemoryValue))
        .filter((candidate): candidate is ProductMatchCandidate => candidate !== null);
      const memoryMatch = findProductMatch(message, memoryCandidates);
      if (memoryMatch) {
        return memoryMatch;
      }
      const dbProducts = await this.prisma.product
        ?.findMany?.({
          where: { workspaceId, active: true },
          select: { id: true, name: true, price: true },
          take: 100,
        })
        .catch(() => []);
      const dbCandidates: ProductMatchCandidate[] = (dbProducts ?? []).map((product) => ({
        name: product.name,
        price: product.price,
      }));
      return findProductMatch(message, dbCandidates);
    } catch (_error: unknown) {
      void this.opsAlert?.alertOnCriticalError(_error, 'LeadMindCoordinator.safeStr');
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
        ...(result.pixQrCode !== undefined ? { pixQrCode: result.pixQrCode } : {}),
        message: result.suggestedMessage,
      };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'LeadMindCoordinator.generatePaymentForLead');
      this.logger.error(`Erro ao gerar pagamento para lead: ${leadErrorMessage(error)}`);
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
      const normalizedPhone = normalizePhone(senderPhone)?.digits ?? '';
      const workspace = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { providerSettings: true, name: true },
      });
      const autopilotEnabled = isAutopilotEnabled(workspace?.providerSettings);

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
              name: buildContactDisplayName(normalizedPhone),
            },
            select: { id: true },
          });
          contactId = contact.id;
        } catch (err: unknown) {
          void this.opsAlert?.alertOnCriticalError(err, 'LeadMindCoordinator.slice');
          this.logger.warn(`Falha ao upsert contact: ${leadErrorMessage(err)}`);
        }
      }

      if (autopilotEnabled) {
        try {
          const unifiedResult = await this.unifiedAgentService.processIncomingMessage({
            workspaceId,
            ...(contactId ? { contactId } : {}),
            phone: normalizedPhone || senderPhone,
            message,
            channel: 'whatsapp',
          });
          const agentResponse = pickUnifiedAgentReply(unifiedResult);
          await this.saveLeadMessage(lead.id, workspaceId, 'assistant', agentResponse);
          await this.updateLeadFromConversation(workspaceId, lead.id, message, agentResponse);
          return agentResponse;
        } catch (agentErr: unknown) {
          void this.opsAlert?.alertOnCriticalError(
            agentErr,
            'LeadMindCoordinator.updateLeadFromConversation',
          );
          this.logger.warn(`UnifiedAgentService falhou: ${leadErrorMessage(agentErr)}`);
        }
      }

      const conversationHistory = await this.getLeadConversationHistory(lead.id, workspaceId);
      const context = await getWorkspaceContext(workspaceId);
      void workspace;
      const arrivalTimestamp = new Date().toISOString();
      const currentInput = {
        raw: message,
        channel: 'whatsapp',
        arrivalTimestamp,
      };
      let effectiveUserContent = buildFallbackCognitiveContent({
        abiStatus: this.abiBuilder ? 'unavailable_or_invalid' : 'builder_not_injected',
        workspaceContext: context,
        channel: 'whatsapp',
        message,
        arrivalTimestamp,
      });

      if (this.abiBuilder) {
        const abiResult = await this.abiBuilder.build({
          audience: 'public',
          currentInput,
          perceptionSnapshot: {
            channel: 'whatsapp',
          },
        });

        if (abiResult.status !== 'ok') {
          this.logger.warn(
            `ABI build failed: ${abiResult.reason}, using structured lead brain fallback`,
          );
        } else {
          const abi = abiResult.abi;
          const validation = validateAbiPayload(abi);

          if (validation.status === 'FAIL') {
            this.logger.warn(
              `ABI validation failed: ${JSON.stringify(validation.issues)}, using structured lead brain fallback`,
            );
          } else {
            effectiveUserContent = buildAbiCognitiveContent({
              abi,
              workspaceContext: context,
              channel: 'whatsapp',
              message,
              arrivalTimestamp,
            });
          }
        }
      }

      const messages: ChatMessage[] = [
        ...conversationHistory,
        { role: 'user', content: effectiveUserContent },
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
      const tokens = response?.usage?.total_tokens ?? 500;
      const rawResponse = response.choices[0]?.message?.content || '';
      const baseLen = messages.reduce((sum, m) => sum + (m.content?.length ?? 0), 0);
      this.logger.log(
        `lead-brain ws=${workspaceId} model=writer baseLen=${baseLen} outLen=${rawResponse.length} tokens=${tokens}`,
      );
      await this.planLimits.trackAiUsage(workspaceId, tokens).catch(() => {});

      const kloelResponse = pickKloelReply(rawResponse);
      if (isShortLlmOutput(rawResponse)) {
        this.logger.warn(`lead-brain short output ws=${workspaceId} len=${rawResponse.length}`);
      }
      await this.saveLeadMessage(lead.id, workspaceId, 'assistant', kloelResponse);
      await this.updateLeadFromConversation(workspaceId, lead.id, message, kloelResponse);
      return kloelResponse;
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(
        error,
        'LeadMindCoordinator.updateLeadFromConversation',
      );
      this.logger.error(`Erro processando mensagem WhatsApp: ${leadErrorMessage(error)}`);
      return LEAD_TECH_ERROR_REPLY;
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
              response: formatPaymentReply(baseResponse, paymentResult.paymentUrl),
              paymentLink: paymentResult.paymentUrl,
              ...(paymentResult.pixQrCode !== undefined
                ? { pixQrCode: paymentResult.pixQrCode }
                : {}),
            };
          }
        }
      }
    }
    return { response: baseResponse };
  }
}

/**
 * @deprecated Use {@link LeadMindCoordinator}. Legacy alias kept for the
 * ADR-0013 Wave M1 4-week alias window.
 */
export { LeadMindCoordinator as KloelLeadBrainService };
