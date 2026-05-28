import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StructuredLogger } from '../logging/structured-logger';
import OpenAI from 'openai';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { chatCompletionWithRetry } from '../kloel/openai-wrapper';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import { PrismaService } from '../prisma/prisma.service';
import {
  PAYMENT_KEYWORDS,
  aggregateEventTaxonomy,
  averageRoundedOrNull,
  buildLatestContactActionMap,
  computeReplyAggregates,
  filterImpactableEvents,
  groupInboundByContact,
  safeRate,
  summarizeDailyTimeline,
  summarizeTopIntents,
} from './autopilot-analytics-insights.helpers';

/**
 * Impact analysis and InsightBot for Autopilot.
 * Extracted from AutopilotAnalyticsReportService to keep each file under 400 lines.
 */
@Injectable()
/**
 * @cluster whatsapp_saas/backend/autopilot
 * L11 multi-agent TaskGraph annotation (batched by tools/auto-pr/batch-job.mjs).
 */
export class AutopilotAnalyticsInsightsService {
  private readonly logger = StructuredLogger.from(AutopilotAnalyticsInsightsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly planLimits: PlanLimitsService,
  ) {}

  /**
   * Impacto aproximado: analisa respostas após ações do Autopilot (últimos 7 dias).
   */
  async getImpact(workspaceId: string) {
    const startedAt = Date.now();
    const operation = 'autopilot/impact';
    try {
      const sinceMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const since = new Date(sinceMs);

      const events = await this.prisma.autopilotEvent.findMany({
        where: { workspaceId, createdAt: { gte: since } },
        select: { contactId: true, createdAt: true, action: true, status: true },
        orderBy: { createdAt: 'desc' },
        take: 5000,
      });

      const impactableEvents = filterImpactableEvents(events);
      const contactActions = buildLatestContactActionMap(impactableEvents);

      const contactIds = Array.from(contactActions.keys());
      const contacts = await this.prisma.contact.findMany({
        take: 10000,
        where: { workspaceId, id: { in: contactIds } },
        select: { id: true, phone: true, name: true },
      });
      const contactMap = new Map<string, { id: string; phone: string; name: string | null }>();
      contacts.forEach((c) => contactMap.set(c.id, c));

      const conversionEvents = impactableEvents.filter((e) => e.action === 'CONVERSION');
      const conversionEventContacts = new Set(
        conversionEvents.map((e) => e.contactId).filter(Boolean),
      );
      const allContactIds = Array.from(contactActions.keys());
      const actionsAnalyzed = impactableEvents.length || contactActions.size;
      const minActionTs =
        allContactIds.length > 0
          ? new Date(Math.min(...Array.from(contactActions.values())))
          : since;

      const [inboundMessages, conversionMessages] = await Promise.all([
        allContactIds.length > 0
          ? this.prisma.message.findMany({
              take: 20000,
              where: {
                workspaceId,
                contactId: { in: allContactIds },
                direction: 'INBOUND',
                createdAt: { gte: minActionTs },
              },
              select: { contactId: true, createdAt: true },
              orderBy: { createdAt: 'asc' },
            })
          : Promise.resolve([]),
        allContactIds.length > 0
          ? this.prisma.message.findMany({
              take: 5000,
              where: {
                workspaceId,
                contactId: { in: allContactIds.filter((id) => !conversionEventContacts.has(id)) },
                direction: 'INBOUND',
                createdAt: { gte: minActionTs },
                OR: PAYMENT_KEYWORDS.map((kw) => ({
                  content: { contains: kw, mode: 'insensitive' },
                })),
              },
              select: { contactId: true },
            })
          : Promise.resolve([]),
      ]);

      const inboundByContact = groupInboundByContact(inboundMessages);

      const { repliedContacts, totalReplies, replyDelays, samples } = computeReplyAggregates(
        contactActions,
        inboundByContact,
        contactMap,
      );
      let conversions = conversionEvents.length;

      const keywordConversionContactIds = new Set(
        conversionMessages.map((m) => m.contactId).filter(Boolean),
      );
      conversions +=
        keywordConversionContactIds.size > 0
          ? [...keywordConversionContactIds].filter((id) => !conversionEventContacts.has(id)).length
          : 0;
      const avgReplyMinutes = averageRoundedOrNull(replyDelays);

      const result = {
        workspaceId,
        windowDays: 7,
        actionsAnalyzed,
        repliedContacts,
        totalReplies,
        avgReplyMinutes,
        replyRate: safeRate(repliedContacts, actionsAnalyzed),
        conversions,
        conversionRate: safeRate(conversions, actionsAnalyzed),
        samples,
      };
      this.logger.log(
        { workspaceId, operation, durationMs: Date.now() - startedAt, status: 'ok' },
        'Autopilot impact succeeded',
      );
      return result;
    } catch (error: unknown) {
      this.logger.error(
        {
          workspaceId,
          operation,
          durationMs: Date.now() - startedAt,
          errorCode: (error as Record<string, unknown>)?.code,
          errorName: error instanceof Error ? error.constructor.name : 'Error',
          status: 'error',
        },
        error instanceof Error ? error.stack : undefined,
        'Autopilot impact failed',
      );
      throw error;
    }
  }

  /** Get insights summary. */
  async getInsights(workspaceId: string) {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const events = await this.prisma.autopilotEvent.findMany({
      take: 5000,
      where: { workspaceId, createdAt: { gte: since } },
      select: { createdAt: true, intent: true, action: true, status: true },
    });

    const { executed, errors, intents, actions: acts } = aggregateEventTaxonomy(events);

    const impact = await this.getImpact(workspaceId);
    const dealsWon = await this.prisma.deal.aggregate({
      where: { status: 'WON', updatedAt: { gte: since }, contact: { workspaceId } },
      _sum: { value: true },
      _count: { id: true },
    });

    const pendingWorkItemStates = ['PENDING', 'OPEN', 'REQUIRED'];
    const [proofSnapshot, pendingApproval, pendingInput, policyAgg, fallbackCount] =
      await Promise.all([
        this.prisma.accountProofSnapshot
          .findFirst({
            where: { workspaceId },
            orderBy: { createdAt: 'desc' },
            select: {
              eligibleActionCount: true,
              blockedActionCount: true,
              deferredActionCount: true,
              waitingApprovalCount: true,
              waitingInputCount: true,
              noLegalActions: true,
            },
          })
          .catch(() => null),
        this.prisma.agentWorkItem
          .count({
            where: {
              workspaceId,
              requiresApproval: true,
              OR: [{ approvalState: { in: pendingWorkItemStates } }, { approvalState: null }],
            },
          })
          .catch(() => 0),
        this.prisma.agentWorkItem
          .count({
            where: {
              workspaceId,
              requiresInput: true,
              OR: [{ inputState: { in: pendingWorkItemStates } }, { inputState: null }],
            },
          })
          .catch(() => 0),
        this.prisma.mindPolicy
          .aggregate({
            where: { workspaceId, createdAt: { gte: since } },
            _avg: { epsilon: true },
            _count: { id: true },
          })
          .catch(() => ({ _avg: { epsilon: null }, _count: { id: 0 } })),
        this.prisma.mindPolicy
          .count({
            where: { workspaceId, fallbackActive: true, createdAt: { gte: since } },
          })
          .catch(() => 0),
      ]);

    return {
      workspaceId,
      executed,
      errors,
      intents,
      actions: acts,
      replyRate: impact.replyRate,
      conversionRate: impact.conversionRate,
      avgReplyMinutes: impact.avgReplyMinutes,
      dealsWon: dealsWon._count?.id || 0,
      revenueWon: dealsWon._sum?.value || 0,
      proofStatus: proofSnapshot
        ? {
            eligibleCount: proofSnapshot.eligibleActionCount,
            blockedCount: proofSnapshot.blockedActionCount,
            deferredCount: proofSnapshot.deferredActionCount,
            waitingApprovalCount: proofSnapshot.waitingApprovalCount,
            waitingInputCount: proofSnapshot.waitingInputCount,
            noLegalActions: proofSnapshot.noLegalActions,
          }
        : null,
      approvalQueue: {
        pendingApprovalCount: pendingApproval,
        pendingInputCount: pendingInput,
      },
      decisionConfidence: {
        avgEpsilon: policyAgg._avg?.epsilon ?? null,
        fallbackActiveCount: fallbackCount,
        totalPolicies: policyAgg._count?.id ?? 0,
      },
    };
  }

  /**
   * InsightBot: responde perguntas rápidas sobre o desempenho do Autopilot.
   */
  async askInsights(workspaceId: string, question: string) {
    const startedAt = Date.now();
    const operation = 'autopilot/ask';
    try {
      const insights = await this.getInsights(workspaceId);
      const timeline = await this.prisma.autopilotEvent
        .groupBy({
          by: ['createdAt'],
          where: {
            workspaceId,
            createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          },
          _count: { _all: true },
        })
        .catch(() => []);
      const timelineSummary = summarizeDailyTimeline(timeline);
      const topIntentsSummary = summarizeTopIntents(insights.intents || {});

      const summary = `\nExecuted: ${insights.executed}\nErrors: ${insights.errors}\nReplyRate: ${(insights.replyRate * 100).toFixed(1)}%\nConversion: ${(insights.conversionRate * 100).toFixed(1)}%\nTop intents: ${topIntentsSummary}\n`;

      const proof = insights.proofStatus;
      const proofLine = proof
        ? `\nRisk/Proof: ${proof.eligibleCount} eligible, ${proof.blockedCount} blocked, ${proof.deferredCount} deferred, ${proof.waitingApprovalCount} awaiting human approval, ${proof.waitingInputCount} needing input. Legal action gate: ${proof.noLegalActions ? 'no legal action currently available; escalate or wait' : 'at least one legal action available'}.`
        : '\nRisk/Proof: no proof snapshot yet (worker may not have run).';

      const aq = insights.approvalQueue;
      const approvalLine = `\nApproval queue: ${aq.pendingApprovalCount} work items awaiting human approval, ${aq.pendingInputCount} needing human input.`;

      const dc = insights.decisionConfidence;
      const epsilonStr = dc.avgEpsilon !== null ? dc.avgEpsilon.toFixed(3) : 'n/a';
      const confidenceLine = `\nDecision confidence: avg epsilon ${epsilonStr}, ${dc.fallbackActiveCount}/${dc.totalPolicies} policies on fallback (more fallbacks = more uncertainty = more human oversight needed).`;

      const enrichedSummary = summary + proofLine + approvalLine + confidenceLine;

      const apiKey = this.config.get<string>('OPENAI_API_KEY');
      if (!apiKey) {
        const response = {
          answer: `Resumo:\n${enrichedSummary}\nPergunta: ${question || 'n/d'}`,
          detail: insights,
        };
        await this.prisma.autopilotEvent
          .create({
            data: {
              workspaceId,
              intent: 'AUTOPILOT_ASK',
              action: 'ANALYZE_INSIGHTS',
              status: 'executed',
              reason: 'ask_insights_offline',
              meta: {
                timelineItems: timelineSummary.length ? timelineSummary.split(', ').length : 0,
                questionPreview: String(question || '').slice(0, 180),
                latencyMs: Date.now() - startedAt,
              },
            },
          })
          .catch(() => {});
        this.logger.log(
          { workspaceId, operation, durationMs: Date.now() - startedAt, status: 'ok' },
          'Autopilot ask succeeded (offline)',
        );
        return response;
      }

      const client = new OpenAI({ apiKey });
      const prompt = `You are a commercial decision-support assistant for a WhatsApp SaaS Autopilot. Your job is to help the operator decide what to do NOW — not just report metrics.

Below is the current state of the Autopilot system. Use the risk/proof/approval/confidence signals to recommend the next concrete action, with clear boundaries (what's safe to automate, what needs human approval, what's too uncertain to act on).

Performance (7d):\n${enrichedSummary}\nTimeline (counts per day): ${timelineSummary}\nQuestion: "${question}"

Answer format:
1. One-sentence diagnosis of the most urgent situation.
2. One specific recommended action the operator should take now.
3. What risk or uncertainty backs that recommendation.
4. What should NOT be automated right now and why.
Answer in Portuguese, short and actionable.`;

      await this.planLimits.ensureTokenBudget(workspaceId);
      const completion = await chatCompletionWithRetry(client, {
        model: resolveBackendOpenAIModel('writer', this.config),
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 256,
      });
      const tokens = completion?.usage?.total_tokens ?? 500;
      const rawAnswer = completion.choices[0]?.message?.content || '';
      this.logger.log(
        `analytics-insights ws=${workspaceId} model=writer baseLen=${prompt.length} outLen=${rawAnswer.length} tokens=${tokens}`,
      );
      await this.planLimits.trackAiUsage(workspaceId, tokens).catch(() => {});

      const answer = rawAnswer || enrichedSummary;
      if (!rawAnswer || rawAnswer.trim().length < 5) {
        this.logger.warn(
          `analytics-insights short output ws=${workspaceId} len=${rawAnswer.length}`,
        );
      }
      await this.prisma.autopilotEvent
        .create({
          data: {
            workspaceId,
            intent: 'AUTOPILOT_ASK',
            action: 'ANALYZE_INSIGHTS',
            status: 'executed',
            reason: 'ask_insights_succeeded',
            meta: {
              timelineItems: timelineSummary.length ? timelineSummary.split(', ').length : 0,
              questionPreview: String(question || '').slice(0, 180),
              latencyMs: Date.now() - startedAt,
              model: resolveBackendOpenAIModel('writer', this.config),
            },
          },
        })
        .catch(() => {});

      this.logger.log(
        { workspaceId, operation, durationMs: Date.now() - startedAt, status: 'ok' },
        'Autopilot ask succeeded',
      );
      return { answer, detail: insights };
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      await this.prisma.autopilotEvent
        .create({
          data: {
            workspaceId,
            intent: 'AUTOPILOT_ASK',
            action: 'ANALYZE_INSIGHTS',
            status: 'error',
            reason: 'ask_insights_failed',
            meta: {
              questionPreview: String(question || '').slice(0, 180),
              latencyMs: Date.now() - startedAt,
              errorName: err.name,
            },
          },
        })
        .catch(() => {});
      this.logger.error(
        {
          workspaceId,
          operation,
          durationMs: Date.now() - startedAt,
          errorCode: (err as Error & { code?: unknown }).code,
          errorName: err.name,
          status: 'error',
        },
        err.stack,
        'Autopilot ask failed',
      );
      throw error;
    }
  }
}
