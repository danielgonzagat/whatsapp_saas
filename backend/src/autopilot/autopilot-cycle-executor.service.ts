import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StructuredLogger } from '../logging/structured-logger';
import OpenAI from 'openai';
import { Prisma } from '@prisma/client';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { renderTemplate } from '../common/sales-templates';
import { chatCompletionWithRetry } from '../kloel/openai-wrapper';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import { MindPolicyService } from '../kloel/mind/policy/mind-policy.service';
import { DecisionOutcomeService } from '../kloel/decision-outcome.service';
import { isAutopilotPerceptEmitEnabled } from './autopilot-percept-emit.flag';
import {
  emitAutopilotActionExecutedPercept,
  emitAutopilotDecisionMadePercept,
} from './autopilot-percept-emit.helper';
import type { MindJson, MindPolicyOption } from '../kloel/mind.types';
import { OpsAlertService } from '../observability/ops-alert.service';
import { PrismaService } from '../prisma/prisma.service';
import { flowQueue } from '../queue/queue';
import {
  AUTOPILOT_MIND_DECISION_TYPE,
  autopilotOutcomeKey as helpersAutopilotOutcomeKey,
  autopilotSubject as helpersAutopilotSubject,
  buildMindActionContext as helpersBuildMindActionContext,
  buildMindActionOptions as helpersBuildMindActionOptions,
  decideActionBaseline as helpersDecideActionBaseline,
  formatProductContext,
  isCommercialAction as helpersIsCommercialAction,
  readRecord as helpersReadRecord,
  resolveHardcodedNightResponse,
  resolveResponseTemplate,
  resolveResponseType,
} from './autopilot-cycle-executor.helpers';

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
    @Optional() private readonly decisionOutcome?: DecisionOutcomeService,
  ) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return helpersReadRecord(value);
  }

  async analyzeContext(
    messages: AutopilotConversation['messages'],
    workspaceId?: string,
  ): Promise<ConversationAnalysis> {
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
      workspaceId,
    });

    let analysisResult: ConversationAnalysis = {
      intent: 'unknown',
      sentiment: 'neutral',
      buyingSignal: false,
    };
    try {
      const parsed: unknown = JSON.parse(completion.choices[0]?.message?.content || '{}');
      if (parsed && typeof parsed === 'object') {
        const record = parsed as Record<string, unknown>;
        analysisResult = {
          intent: typeof record.intent === 'string' ? record.intent : 'unknown',
          sentiment: typeof record.sentiment === 'string' ? record.sentiment : 'neutral',
          buyingSignal: typeof record.buyingSignal === 'boolean' ? record.buyingSignal : false,
          stage: typeof record.stage === 'string' ? record.stage : undefined,
        };
      }
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
      // ADDITIVE, flag-gated, best-effort: emit ONE canonical
      // `cognition.autopilot.decision_made` percept so the cognition loop is no
      // longer blind to autopilot's per-conversation action decisions. Behind
      // `KLOEL_AUTOPILOT_PERCEPT_ENABLED` (DEFAULT OFF). The helper swallows its
      // own errors; this `await` cannot throw, so the decision above and
      // autopilot behavior are NEVER affected.
      await emitAutopilotDecisionMadePercept(this.prisma, this.logger, {
        workspaceId: conv.workspaceId,
        conversationId: conv.id,
        chosenAction: result.chosen,
        baselineAction: baseline,
        mindInfluenced: result.chosen !== baseline,
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
    return helpersDecideActionBaseline(analysis, isOptimalTime);
  }

  private buildMindActionContext(
    analysis: { intent?: string; sentiment?: string; buyingSignal?: boolean; stage?: string },
    conv: AutopilotConversation,
    isOptimalTime: boolean,
  ): MindJson {
    return helpersBuildMindActionContext(analysis, conv, isOptimalTime);
  }

  private buildMindActionOptions(context: MindJson): MindPolicyOption[] {
    return helpersBuildMindActionOptions(context);
  }

  private autopilotSubject(conv: AutopilotConversation): string {
    return helpersAutopilotSubject(conv);
  }

  private autopilotOutcomeKey(conv: AutopilotConversation): string {
    return helpersAutopilotOutcomeKey(conv);
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
      // ADDITIVE, flag-gated, best-effort: now that the autonomous send is
      // enqueued, emit ONE canonical `cognition.autopilot.action_executed`
      // percept AND record this autonomous action in the decision ledger so the
      // Mind perceives + learns from autopilot. Behind
      // `KLOEL_AUTOPILOT_PERCEPT_ENABLED` (DEFAULT OFF). Both helpers swallow
      // their own errors; these awaits cannot throw, so the send above and
      // autopilot behavior are NEVER affected.
      await emitAutopilotActionExecutedPercept(this.prisma, this.logger, {
        workspaceId: conv.workspaceId,
        conversationId: conv.id,
        action,
        complianceAllowed: compliance.allowed,
        intent: analysis?.intent ?? 'unknown',
      });
      await this.recordAutopilotDecision(action, conv, analysis);
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
    const responseType = resolveResponseType(action);
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

    const hardcodedNight = resolveHardcodedNightResponse(action);
    if (hardcodedNight !== null) {
      return hardcodedNight;
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
    return helpersIsCommercialAction(type);
  }

  /**
   * ADDITIVE, flag-gated, best-effort: record an autopilot autonomous action as
   * a decision in the canonical decision ledger
   * (`DecisionOutcomeService.recordDecision`) so the Mind perceives + learns
   * from autopilot. Behind `KLOEL_AUTOPILOT_PERCEPT_ENABLED` (DEFAULT OFF) and
   * only when the optional `DecisionOutcomeService` is DI-provided. Wrapped in
   * try/catch + warn-log so it can NEVER break the autopilot send path or alter
   * autopilot behavior. The `outcomeKey` reuses the autopilot Mind outcome key
   * so a later commerce/outcome closure can attribute against the same anchor.
   */
  private async recordAutopilotDecision(
    action: string,
    conv: AutopilotConversation,
    analysis?: ConversationAnalysis,
  ): Promise<void> {
    if (!isAutopilotPerceptEmitEnabled() || !this.decisionOutcome || !conv.workspaceId) {
      return;
    }
    try {
      await this.decisionOutcome.recordDecision({
        workspaceId: conv.workspaceId,
        decisionType: AUTOPILOT_MIND_DECISION_TYPE,
        chosenAction: action,
        baselineAction: this.decideActionBaseline(analysis ?? {}, false),
        outcomeKey: this.autopilotOutcomeKey(conv),
        expectedWindow: 24,
        contextSnapshot: {
          conversationId: conv.id,
          intent: analysis?.intent ?? 'unknown',
          sentiment: analysis?.sentiment ?? 'neutral',
          buyingSignal: analysis?.buyingSignal ?? false,
          source: 'autopilot_cycle',
        },
      });
    } catch (err: unknown) {
      this.logger.warn(
        `[Autopilot] decision-ledger record failed for conv ${conv.id}; the ` +
          `autonomous send succeeded and is unaffected: ${err instanceof Error ? err.message : 'unknown_error'}`,
      );
    }
  }

  /**
   * Honestly record that an autopilot reply was skipped (e.g. the LLM client is
   * unavailable) instead of emitting a canned reply. Mirrors the compliance-skip
   * audit-trail pattern in {@link executeAction} — best-effort, never throws.
   */
  private async recordSkippedEvent(
    action: string,
    conv: AutopilotConversation,
    reason: string,
    analysis?: ConversationAnalysis,
  ): Promise<void> {
    this.logger.warn({
      operation: 'autopilot.reply_skipped',
      workspaceId: conv.workspaceId,
      conversationId: conv.id,
      action,
      reason,
    });
    try {
      await this.prisma.autopilotEvent.create({
        data: {
          workspaceId: conv.workspaceId,
          ...(conv.contact?.id !== undefined ? { contactId: conv.contact.id } : {}),
          intent: analysis?.intent || 'UNKNOWN',
          action,
          status: 'skipped',
          reason,
        },
      });
    } catch {
      void this.opsAlert?.alertOnCriticalError(
        new Error('autopilotEvent.create failed silently'),
        'AutopilotCycleExecutorService.recordSkippedEvent',
        { workspaceId: conv.workspaceId },
      );
    }
  }

  private async generateResponse(
    type: string,
    conv: AutopilotConversation,
    analysis?: ConversationAnalysis,
  ) {
    if (!this.openai) {
      // No LLM configured in a production-reachable path. Do NOT emit a canned
      // greeting masquerading as AI — honestly record a skipped event so the
      // conversation waits / hands off to a human instead.
      await this.recordSkippedEvent(type, conv, 'ai_unavailable', analysis);
      return null;
    }

    let productContext = '';
    if (this.isCommercialAction(type) && conv.workspaceId) {
      const info = await this.fetchWorkspaceProductInfo(conv.workspaceId);
      if (!info.hasProducts) {
        return 'Olá! No momento não temos produtos disponíveis para oferecer. Um consultor entrará em contato em breve com mais informações. Posso ajudar com outra dúvida enquanto isso?';
      }
      productContext = formatProductContext(info.products);
    }

    const prompt = `
    You are a top-tier sales assistant on WhatsApp.
    Context: User is ${analysis?.intent || 'interested'}.
    Task: ${resolveResponseTemplate(type)}
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
    this.logger.log(
      `autopilot-response ws=${conv?.workspaceId} model=writer baseLen=${prompt.length} outLen=${rawContent?.length ?? 0} tokens=${completion?.usage?.total_tokens ?? 500}`,
    );
    if (!rawContent || rawContent.trim().length < 5) {
      this.logger.warn('[Autopilot] generateResponse produced empty/short output', {
        type,
        convId: conv.id,
        workspaceId: conv.workspaceId,
      });
      return null;
    }
    return rawContent;
  }
}
