import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { chatCompletionWithRetry } from '../kloel/openai-wrapper';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Impact analysis and InsightBot for Autopilot.
 * Extracted from AutopilotAnalyticsReportService to keep each file under 400 lines.
 */
@Injectable()
export class AutopilotAnalyticsInsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly planLimits: PlanLimitsService,
  ) {}

  /**
   * Impacto aproximado: analisa respostas após ações do Autopilot (últimos 7 dias).
   */
  async getImpact(workspaceId: string) {
    const sinceMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const since = new Date(sinceMs);

    const events = await this.prisma.autopilotEvent.findMany({
      where: { workspaceId, createdAt: { gte: since } },
      select: { contactId: true, createdAt: true, action: true },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });

    const contactActions = new Map<string, number>();
    for (const ev of events) {
      if (!ev.contactId) continue;
      const ts = ev.createdAt.getTime();
      const current = contactActions.get(ev.contactId);
      if (!current || ts > current) contactActions.set(ev.contactId, ts);
    }

    const contactIds = Array.from(contactActions.keys());
    const contacts = await this.prisma.contact.findMany({
      take: 10000,
      where: { workspaceId, id: { in: contactIds } },
      select: { id: true, phone: true, name: true },
    });
    const contactMap = new Map<string, { id: string; phone: string; name: string | null }>();
    contacts.forEach((c) => contactMap.set(c.id, c));

    const conversionEvents = events.filter((e) => e.action === 'CONVERSION');
    const conversionEventContacts = new Set(
      conversionEvents.map((e) => e.contactId).filter(Boolean),
    );
    const allContactIds = Array.from(contactActions.keys());
    const actionsAnalyzed = events.length || contactActions.size;
    const minActionTs =
      allContactIds.length > 0 ? new Date(Math.min(...Array.from(contactActions.values()))) : since;
    const paymentKeywords = [
      'paguei',
      'pago',
      'pix',
      'pague',
      'comprei',
      'compre',
      'boleto',
      'assinatura',
    ];

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
              OR: paymentKeywords.map((kw) => ({ content: { contains: kw, mode: 'insensitive' } })),
            },
            select: { contactId: true },
          })
        : Promise.resolve([]),
    ]);

    const inboundByContact = new Map<string, Date[]>();
    for (const msg of inboundMessages) {
      if (!msg.contactId) continue;
      const list = inboundByContact.get(msg.contactId) || [];
      list.push(msg.createdAt);
      inboundByContact.set(msg.contactId, list);
    }

    let repliedContacts = 0;
    let totalReplies = 0;
    const replyDelays: number[] = [];
    const samples: Array<{
      contactId: string;
      contact: string;
      replyAt: Date;
      delayMinutes: number;
    }> = [];
    let conversions = conversionEvents.length;

    for (const [contactId, actionTs] of contactActions.entries()) {
      const replies = (inboundByContact.get(contactId) || []).filter((d) => d.getTime() > actionTs);
      if (replies.length > 0) {
        repliedContacts += 1;
        totalReplies += replies.length;
        const delay = Math.round((replies[0].getTime() - actionTs) / 60000);
        replyDelays.push(delay);
        const contact = contactMap.get(contactId);
        if (samples.length < 5 && contact) {
          samples.push({
            contactId,
            contact: contact.name || contact.phone,
            replyAt: replies[0],
            delayMinutes: delay,
          });
        }
      }
    }

    const keywordConversionContactIds = new Set(
      conversionMessages.map((m) => m.contactId).filter(Boolean),
    );
    conversions +=
      keywordConversionContactIds.size > 0
        ? [...keywordConversionContactIds].filter((id) => !conversionEventContacts.has(id)).length
        : 0;
    const avgReplyMinutes =
      replyDelays.length > 0
        ? Math.round(replyDelays.reduce((a, b) => a + b, 0) / replyDelays.length)
        : null;

    return {
      workspaceId,
      windowDays: 7,
      actionsAnalyzed,
      repliedContacts,
      totalReplies,
      avgReplyMinutes,
      replyRate: actionsAnalyzed > 0 ? repliedContacts / actionsAnalyzed : 0,
      conversions,
      conversionRate: actionsAnalyzed > 0 ? conversions / actionsAnalyzed : 0,
      samples,
    };
  }

  /** Get insights summary. */
  async getInsights(workspaceId: string) {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const events = await this.prisma.autopilotEvent.findMany({
      take: 5000,
      where: { workspaceId, createdAt: { gte: since } },
      select: { createdAt: true, intent: true, action: true, status: true },
    });

    let executed = 0;
    let errors = 0;
    const intents: Record<string, number> = {};
    const acts: Record<string, number> = {};

    events.forEach((e) => {
      const intent = e.intent || 'UNKNOWN';
      const action = e.action || 'UNKNOWN';
      intents[intent] = (intents[intent] || 0) + 1;
      acts[action] = (acts[action] || 0) + 1;
      if (e.status === 'error') {
        errors += 1;
      } else {
        executed += 1;
      }
    });

    const impact = await this.getImpact(workspaceId);
    const dealsWon = await this.prisma.deal.aggregate({
      where: { status: 'WON', updatedAt: { gte: since }, contact: { workspaceId } },
      _sum: { value: true },
      _count: { id: true },
    });

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
    };
  }

  /**
   * InsightBot: responde perguntas rápidas sobre o desempenho do Autopilot.
   */
  async askInsights(workspaceId: string, question: string) {
    const startedAt = Date.now();
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
      const timelineSummary = Array.isArray(timeline)
        ? timeline
            .map((entry) => {
              const createdAt =
                entry?.createdAt instanceof Date
                  ? entry.createdAt.toISOString()
                  : String(entry?.createdAt ?? 'unknown');
              const count = typeof entry?._count?._all === 'number' ? entry._count._all : 0;
              return `${createdAt}:${count}`;
            })
            .sort((left, right) => left.localeCompare(right))
            .join(', ')
        : 'n/a';

      const topIntentsSummary = Object.entries(insights.intents || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([intent, count]) => `${intent}:${count}`)
        .join(', ');

      const summary = `\nExecuted: ${insights.executed}\nErrors: ${insights.errors}\nReplyRate: ${(insights.replyRate * 100).toFixed(1)}%\nConversion: ${(insights.conversionRate * 100).toFixed(1)}%\nTop intents: ${topIntentsSummary}\n`;

      const apiKey = this.config.get<string>('OPENAI_API_KEY');
      if (!apiKey) {
        const response = {
          answer: `Resumo:\n${summary}\nPergunta: ${question || 'n/d'}`,
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
        return response;
      }

      const client = new OpenAI({ apiKey });
      const prompt = `You are an assistant that summarizes Autopilot performance for a WhatsApp SaaS.\nMetrics (7d):\n${summary}\nTimeline (counts per day, optional): ${timelineSummary}\nQuestion: "${question}"\nAnswer in Portuguese, short and actionable.`;

      await this.planLimits.ensureTokenBudget(workspaceId);
      const completion = await chatCompletionWithRetry(client, {
        model: resolveBackendOpenAIModel('writer', this.config),
        messages: [{ role: 'user', content: prompt }],
      });
      await this.planLimits
        .trackAiUsage(workspaceId, completion?.usage?.total_tokens ?? 500)
        .catch(() => {});

      const answer = completion.choices[0]?.message?.content || summary;
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

      return { answer, detail: insights };
    } catch (error: unknown) {
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
              errorName: error instanceof Error ? error.name : 'Error',
            },
          },
        })
        .catch(() => {});
      throw error;
    }
  }
}
