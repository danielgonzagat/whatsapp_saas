import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StructuredLogger } from '../logging/structured-logger';
import OpenAI from 'openai';
import { Prisma } from '@prisma/client';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { renderTemplate } from '../common/sales-templates';
import { chatCompletionWithRetry } from '../kloel/openai-wrapper';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import { MindPolicyService } from '../kloel/mind-policy.service';
import type { MindJson, MindPolicyOption } from '../kloel/mind.types';
import { OpsAlertService } from '../observability/ops-alert.service';
import { PrismaService } from '../prisma/prisma.service';
import { flowQueue } from '../queue/queue';

/** Lightweight shape used by autopilot cycle executor. */
/**
 * @cluster whatsapp_saas/backend/autopilot
 * L11 multi-agent TaskGraph annotation (batched by tools/auto-pr/batch-job.mjs).
 */
export interface AutopilotConversation {
  id: string;
  workspaceId: string;
  contact: {
    id: string;
    phone: string;
    name?: string | null;
    tags?: Array<{ name: string }>;
    customFields?: Prisma.JsonValue;
    workspace?: Record<string, unknown>;
  };
  contactId?: string;
  messages: Array<{ direction: string; content: string | null; createdAt: Date }>;
  workspace?: Record<string, unknown>;
}

/** Analysis result from the OpenAI conversation analysis */
export interface ConversationAnalysis {
  intent?: string;
  sentiment?: string;
  buyingSignal?: boolean;
  stage?: string;
}

const AUTOPILOT_MIND_DECISION_TYPE = 'autopilot_action';
const AUTOPILOT_ACTIONS = [
  'send_offer',
  'send_offer_soft',
  'send_price',
  'send_calendar',
  'handover_human',
  'handle_objection',
  'qualify',
  'try_upsell',
  'send_cta',
  'soft_close_night',
  'auto_reply_night',
  'ai_chat',
] as const;

/**
 * Handles AI response generation, action execution, and compliance for autopilot cycles.
 * Extracted from AutopilotCycleService to keep each file under 400 lines.
 */
@Injectable()
export class AutopilotCycleExecutorService {
  private readonly logger = StructuredLogger.from(AutopilotCycleExecutorService.name);
  private readonly openai: OpenAI | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly planLimits: PlanLimitsService,
    @Optional() private readonly opsAlert?: OpsAlertService,
    @Optional() private readonly mindPolicy?: MindPolicyService,
  ) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  }

  async analyzeContext(messages: AutopilotConversation['messages']): Promise<ConversationAnalysis> {
    if (!this.openai) {
      return { intent: 'unknown', sentiment: 'neutral', buyingSignal: false };
    }

    const history = messages
      .map((m) => `${m.direction}: ${m.content}`)
      .reverse()
      .join('\n');
    const prompt = `
    Analyze this WhatsApp conversation.
    History:
    ${history}

    Return JSON:
    - intent: (question_price, question_product, complaint, greeting, scheduling, buying, objection)
    - sentiment: (positive, neutral, negative)
    - buyingSignal: (boolean) - Is the user ready to buy?
    - stage: (new, negotiation, closing, support)
    `;

    const completion = await chatCompletionWithRetry(this.openai, {
      model: resolveBackendOpenAIModel('brain', this.config),
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 256,
    });
    this.logger.log('[Autopilot] analyzeContext completed', {
      tokens: completion?.usage?.total_tokens,
      model: resolveBackendOpenAIModel('brain', this.config),
    });

    let analysisResult: ConversationAnalysis = {
      intent: 'unknown',
      sentiment: 'neutral',
      buyingSignal: false,
    };
    try {
      analysisResult = JSON.parse(completion.choices[0]?.message?.content || '{}');
    } catch {
      /* invalid JSON from model */
    }
    return analysisResult;
  }

  async decideAction(
    analysis: { intent?: string; sentiment?: string; buyingSignal?: boolean; stage?: string },
    conv: AutopilotConversation,
    isOptimalTime: boolean,
  ): Promise<string> {
    const baseline = this.decideActionBaseline(analysis, isOptimalTime);
    if (!this.mindPolicy) {
      return baseline;
    }

    const context = this.buildMindActionContext(analysis, conv, isOptimalTime);
    try {
      const result = await this.mindPolicy.choose({
        workspaceId: conv.workspaceId,
        subject: this.autopilotSubject(conv),
        decisionType: AUTOPILOT_MIND_DECISION_TYPE,
        context,
        baselineActionQuiet: baseline,
        options: this.buildMindActionOptions(context),
        outcomeKey: this.autopilotOutcomeKey(conv),
      });
      return result.chosen;
    } catch (error: unknown) {
      this.logger.warn({
        operation: 'autopilot.mind_decision_failed',
        workspaceId: conv.workspaceId,
        conversationId: conv.id,
        baseline,
        errorCode: error instanceof Error ? error.message : 'unknown',
      });
      return baseline;
    }
  }

  private decideActionBaseline(
    analysis: { intent?: string; sentiment?: string; buyingSignal?: boolean; stage?: string },
    isOptimalTime: boolean,
  ): string {
    const { intent, sentiment, buyingSignal, stage } = analysis;
    const hour = new Date().getHours();
    const isNight = hour > 22 || hour < 7;

    return (
      this.decideNightAction(isNight, buyingSignal) ??
      this.decideBuyingAction(buyingSignal, isOptimalTime) ??
      this.decideIntentAction(intent) ??
      this.decideStageAction(stage, sentiment, buyingSignal) ??
      'ai_chat'
    );
  }

  private decideNightAction(isNight: boolean, buyingSignal?: boolean): string | null {
    if (!isNight) {
      return null;
    }
    return buyingSignal ? 'soft_close_night' : 'auto_reply_night';
  }

  private decideBuyingAction(buyingSignal?: boolean, isOptimalTime?: boolean): string | null {
    if (!buyingSignal) {
      return null;
    }
    return isOptimalTime ? 'send_offer' : 'send_offer_soft';
  }

  private decideIntentAction(intent?: string): string | null {
    const INTENT_ACTION_MAP: Record<string, string> = {
      question_price: 'send_price',
      scheduling: 'send_calendar',
      complaint: 'handover_human',
      objection: 'handle_objection',
    };
    return intent ? (INTENT_ACTION_MAP[intent] ?? null) : null;
  }

  private decideStageAction(
    stage?: string,
    sentiment?: string,
    buyingSignal?: boolean,
  ): string | null {
    if (stage === 'new') {
      return 'qualify';
    }
    if (stage === 'closing') {
      return sentiment === 'positive' && !buyingSignal ? 'try_upsell' : 'send_cta';
    }
    return null;
  }

  private buildMindActionContext(
    analysis: { intent?: string; sentiment?: string; buyingSignal?: boolean; stage?: string },
    conv: AutopilotConversation,
    isOptimalTime: boolean,
  ): MindJson {
    const lastInbound = conv.messages.find((message) => message.direction === 'INBOUND');
    return {
      channel: 'whatsapp',
      conversationId: conv.id,
      contactId: conv.contact?.id ?? conv.contactId ?? null,
      hour: new Date().getHours(),
      intent: analysis.intent ?? 'unknown',
      sentiment: analysis.sentiment ?? 'neutral',
      buyingSignal: analysis.buyingSignal === true,
      stage: analysis.stage ?? 'unknown',
      isOptimalTime,
      lastInboundAt: lastInbound?.createdAt?.toISOString?.() ?? null,
    };
  }

  private buildMindActionOptions(context: MindJson): MindPolicyOption[] {
    return AUTOPILOT_ACTIONS.map((action) => ({
      action,
      predicate: 'P(success|autopilot_action,intent,stage,channel,hour)',
      context: { ...context, action },
    }));
  }

  private autopilotSubject(conv: AutopilotConversation): string {
    const contactId = conv.contact?.id ?? conv.contactId;
    return contactId ? `contact:${contactId}` : `conversation:${conv.id}`;
  }

  private autopilotOutcomeKey(conv: AutopilotConversation): string {
    const lastInbound = conv.messages.find((message) => message.direction === 'INBOUND');
    const lastInboundAt = lastInbound?.createdAt?.toISOString?.() ?? 'no-inbound';
    return `autopilot_action:${conv.workspaceId}:${conv.id}:${lastInboundAt}`;
  }

  async executeAction(
    action: string,
    conv: AutopilotConversation,
    compliance: { allowed: boolean; reason?: string },
    analysis?: ConversationAnalysis,
  ) {
    this.logger.log(`[Autopilot] Executing ${action} for ${conv.id}`);

    if (!compliance.allowed) {
      this.logger.warn(
        `[Autopilot] Skip compliance for ${conv.contact?.id || conv.contactId || 'unknown'}: ${compliance.reason}`,
      );
      try {
        await this.prisma.autopilotEvent.create({
          data: {
            workspaceId: conv.workspaceId,
            ...(conv.contact?.id !== undefined ? { contactId: conv.contact.id } : {}),
            intent: analysis?.intent || 'UNKNOWN',
            action,
            status: 'skipped',
            ...(compliance.reason !== undefined ? { reason: compliance.reason } : {}),
            meta: { compliance: true },
          },
        });
      } catch {
        void this.opsAlert?.alertOnCriticalError(
          new Error('autopilotEvent.create failed silently'),
          'AutopilotCycleExecutorService.executeAction',
          { workspaceId: conv.workspaceId },
        );
      }
      return;
    }

    const responseText = await this.resolveActionResponse(action, conv, analysis);
    if (responseText === null) {
      return;
    }
    if (responseText === '') {
      return;
    }

    try {
      await this.planLimits.ensureDailyMessageQuota(conv.workspaceId);
      await this.planLimits.ensureMessageRate(conv.workspaceId);
      await flowQueue.add('send-message', {
        workspaceId: conv.workspaceId,
        to: conv.contact.phone,
        user: conv.contact.phone,
        message: responseText,
      });
    } catch (err: unknown) {
      this.logger.warn(
        `[Autopilot] Falha ao enfileirar envio: ${err instanceof Error ? err.message : 'unknown_error'}`,
      );
      void this.opsAlert?.alertOnCriticalError(
        err,
        'AutopilotCycleExecutorService.executeAction.send',
        {
          workspaceId: conv.workspaceId,
        },
      );
    }
  }

  private async resolveActionResponse(
    action: string,
    conv: AutopilotConversation,
    analysis?: ConversationAnalysis,
  ): Promise<string | null> {
    const ACTION_TO_RESPONSE_TYPE: Record<string, string> = {
      send_offer: 'offer',
      send_offer_soft: 'offer_soft',
      send_price: 'price',
      follow_up: 'follow_up',
      lead_unlocker: 'lead_unlocker',
      handle_objection: 'objection',
      qualify: 'qualify',
      try_upsell: 'upsell',
      ai_chat: 'chat',
    };

    const responseType = ACTION_TO_RESPONSE_TYPE[action];
    if (responseType) {
      return await this.generateResponse(responseType, conv, analysis);
    }

    if (action === 'send_calendar') {
      const calendarLink =
        (this.readRecord(this.readRecord(conv?.workspace).providerSettings)
          .calendarLink as string) || undefined;

      return renderTemplate('SEND_CALENDAR', {
        ...(calendarLink !== undefined ? { calendarLink } : {}),
      });
    }

    const HARDCODED_RESPONSES: Record<string, string> = {
      soft_close_night:
        'Oi! Vi seu interesse. Já deixei tudo preparado para você. Amanhã cedo eu retomo para concluirmos, tudo bem?',
      auto_reply_night:
        'Opa! Agora estou offline, mas já anotei sua dúvida. Amanhã 8h te respondo sem falta!',
    };

    if (action in HARDCODED_RESPONSES) {
      return HARDCODED_RESPONSES[action] ?? null;
    }

    if (action === 'handover_human') {
      this.logger.warn(
        `[Autopilot] Handover to human for conv ${conv.id} — complaint intent detected`,
      );
      return null;
    }

    return '';
  }

  private async fetchWorkspaceProductInfo(workspaceId: string): Promise<{
    products: Array<{
      name: string;
      price: number;
      currency: string;
      description: string | null;
      active: boolean;
    }>;
    hasProducts: boolean;
  }> {
    const products = await this.prisma.product.findMany({
      where: { workspaceId, active: true },
      select: { name: true, price: true, currency: true, description: true, active: true },
      orderBy: { featured: 'desc' },
      take: 5,
    });
    return { products, hasProducts: products.length > 0 };
  }

  private isCommercialAction(type: string): boolean {
    return ['offer', 'offer_soft', 'price', 'upsell', 'lead_unlocker'].includes(type);
  }

  private async generateResponse(
    type: string,
    conv: AutopilotConversation,
    analysis?: ConversationAnalysis,
  ) {
    if (!this.openai) {
      return 'Olá, como posso ajudar?';
    }

    const templates: Record<string, string> = {
      offer:
        'Generate an irresistible offer closing for this context. Create Urgency. Keep it short.',
      offer_soft: 'Generate a gentle offer closing. Focus on value, no pressure.',
      price: 'Explain the price/value proposition. Be direct but persuasive.',
      follow_up: 'Re-engage this lead who went silent. Be polite but intriguing.',
      lead_unlocker:
        "The lead disappeared. Send a 'mental trigger' question to unlock them (e.g., 'Did you give up on X?'). Short and punchy.",
      objection: "Overcome the user's objection with empathy and authority.",
      qualify: 'Ask a qualifying question to understand their needs better.',
      upsell: 'Suggest a complementary product or upgrade (Upsell) naturally.',
      chat: "Reply naturally to the user's last message. Be helpful and concise.",
    };

    let productContext = '';
    if (this.isCommercialAction(type) && conv.workspaceId) {
      const info = await this.fetchWorkspaceProductInfo(conv.workspaceId);
      if (!info.hasProducts) {
        return 'Olá! No momento não temos produtos disponíveis para oferecer. Um consultor entrará em contato em breve com mais informações. Posso ajudar com outra dúvida enquanto isso?';
      }
      productContext = info.products
        .map(
          (p) =>
            `- ${p.name}: ${p.currency === 'BRL' ? 'R$' : `${p.currency} `}${p.price.toFixed(2)}${p.description ? ` — ${p.description}` : ''}`,
        )
        .join('\n');
    }

    const prompt = `
    You are a top-tier sales assistant on WhatsApp.
    Context: User is ${analysis?.intent || 'interested'}.
    Task: ${templates[type] || templates.chat}
    Last Message: ${conv.messages[0]?.content}
${productContext ? `\nAVAILABLE PRODUCTS (use ONLY these real products in your response — never invent or hallucinate names, prices, or features):\n${productContext}` : ''}

    RULES:
    - NEVER invent product names, prices, bundles, promotions, deadlines, guarantees, or policies.
    - If the user asks about a product not listed, say you'll check and get back.
    - Write the WhatsApp message response (Portuguese Brazil). No quotes.
    `;

    if (conv?.workspaceId) {
      await this.planLimits.ensureTokenBudget(conv.workspaceId);
    }
    const completion = await chatCompletionWithRetry(this.openai, {
      model: resolveBackendOpenAIModel('writer', this.config),
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 800,
    });
    if (conv?.workspaceId) {
      await this.planLimits
        .trackAiUsage(conv.workspaceId, completion?.usage?.total_tokens ?? 500)
        .catch(() => {});
    }

    const rawContent = completion.choices[0]?.message?.content;
    if (!rawContent || rawContent.trim().length < 5) {
      this.logger.warn('[Autopilot] generateResponse produced empty/short output', { type, convId: conv.id, workspaceId: conv.workspaceId });
      return null;
    }
    return rawContent;
  }
}
