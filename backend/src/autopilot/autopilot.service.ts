import {
  Injectable,
  Logger,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { InboxService } from '../inbox/inbox.service';
import { SmartTimeService } from '../analytics/smart-time/smart-time.service';
import { autopilotQueue, flowQueue } from '../queue/queue';
import { Queue } from 'bullmq';
import { createRedisClient } from '../common/redis/redis.util';
import { randomUUID } from 'crypto';
import {
  chatCompletionWithFallback,
  callOpenAIWithRetry,
} from '../kloel/openai-wrapper';
import { buildQueueJobId } from '../queue/job-id.util';
import { resolveBackendOpenAIModel } from '../lib/openai-models';

@Injectable()
export class AutopilotService {
  private readonly logger = new Logger(AutopilotService.name);
  private openai: OpenAI | null;
  private campaignQueue: Queue;
  private readonly redisClient: any;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private inbox: InboxService,
    private smartTime: SmartTimeService,
  ) {
    const apiKey = this.config.get('OPENAI_API_KEY');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;

    const connection = createRedisClient();
    this.redisClient = connection;
    this.campaignQueue = new Queue('campaign-jobs', { connection });
  }

  private normalizePhone(phone?: string) {
    return String(phone || '').replace(/\D/g, '');
  }

  private async sleep(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private isLegacyExecutionEnabled() {
    return process.env.ENABLE_LEGACY_BACKEND_AUTOPILOT === 'true';
  }

  async getPipelineStatus(workspaceId: string) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        name: true,
        providerSettings: true,
      },
    });

    const [
      inboundReceived,
      outboundSent,
      autopilotExecuted,
      autopilotSkipped,
      autopilotFailed,
      lastInbound,
      lastOutbound,
      lastAutopilotEvent,
      queueCounts,
      recentFailures,
    ] = await Promise.all([
      this.prisma.message.count({
        where: { workspaceId, direction: 'INBOUND', createdAt: { gte: since } },
      }),
      this.prisma.message.count({
        where: {
          workspaceId,
          direction: 'OUTBOUND',
          createdAt: { gte: since },
        },
      }),
      this.prisma.autopilotEvent.count({
        where: { workspaceId, status: 'executed', createdAt: { gte: since } },
      }),
      this.prisma.autopilotEvent.count({
        where: { workspaceId, status: 'skipped', createdAt: { gte: since } },
      }),
      this.prisma.autopilotEvent.count({
        where: {
          workspaceId,
          status: { in: ['error', 'failed'] },
          createdAt: { gte: since },
        },
      }),
      this.prisma.message.findFirst({
        where: { workspaceId, direction: 'INBOUND' },
        orderBy: { createdAt: 'desc' },
        select: { id: true, content: true, createdAt: true, contactId: true },
      }),
      this.prisma.message.findFirst({
        where: { workspaceId, direction: 'OUTBOUND' },
        orderBy: { createdAt: 'desc' },
        select: { id: true, content: true, createdAt: true, contactId: true },
      }),
      this.prisma.autopilotEvent.findFirst({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
      }),
      autopilotQueue.getJobCounts('waiting', 'active', 'delayed', 'failed'),
      this.prisma.autopilotEvent.findMany({
        where: {
          workspaceId,
          status: { in: ['error', 'failed'] },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          createdAt: true,
          contactId: true,
          action: true,
          reason: true,
          status: true,
        },
      }),
    ]);

    const settings = (workspace?.providerSettings as Record<string, any>) || {};
    const sessionStatus = settings?.whatsappApiSession?.status || 'unknown';

    return {
      workspaceId,
      workspaceName: workspace?.name || null,
      windowHours: 24,
      autonomy: {
        autopilotEnabled: settings?.autopilot?.enabled === true,
        whatsappStatus: sessionStatus,
        connected: ['connected', 'working'].includes(
          String(sessionStatus).toLowerCase(),
        ),
      },
      messages: {
        received: inboundReceived,
        responded: outboundSent,
        unansweredEstimate: Math.max(inboundReceived - outboundSent, 0),
        lastInbound,
        lastOutbound,
      },
      autopilot: {
        executed: autopilotExecuted,
        skipped: autopilotSkipped,
        failed: autopilotFailed,
        lastEvent: lastAutopilotEvent,
        recentFailures,
      },
      queue: queueCounts,
    };
  }

  async runSmokeTest(input: {
    workspaceId: string;
    phone?: string;
    message?: string;
    waitMs?: number;
    liveSend?: boolean;
  }) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: input.workspaceId },
      select: { id: true, name: true, providerSettings: true },
    });
    if (!workspace) {
      throw new NotFoundException('Workspace não encontrado para smoke test');
    }

    const phone =
      this.normalizePhone(input.phone) ||
      this.normalizePhone(process.env.AUTOPILOT_TEST_PHONE) ||
      '5511999999999';
    const message =
      String(input.message || '').trim() ||
      'Olá, quero testar se o Kloel está respondendo corretamente no WhatsApp.';
    const smokeTestId = randomUUID();
    const smokeKey = `autopilot:smoke:${smokeTestId}`;
    const waitMs = Math.min(Math.max(input.waitMs || 12000, 2000), 30000);
    const contact = await this.prisma.contact.upsert({
      where: {
        workspaceId_phone: {
          workspaceId: input.workspaceId,
          phone,
        },
      },
      update: {},
      create: {
        workspaceId: input.workspaceId,
        phone,
        name: `Smoke Test ${phone}`,
      },
      select: { id: true },
    });

    await this.redisClient.set(
      smokeKey,
      JSON.stringify({
        smokeTestId,
        status: 'queued',
        workspaceId: input.workspaceId,
        contactId: contact.id,
        phone,
        mode: input.liveSend ? 'live' : 'dry-run',
        queuedAt: new Date().toISOString(),
      }),
      'EX',
      300,
    );

    await autopilotQueue.add(
      'scan-contact',
      {
        workspaceId: input.workspaceId,
        contactId: contact.id,
        phone,
        messageContent: message,
        smokeTestId,
        smokeMode: input.liveSend ? 'live' : 'dry-run',
      },
      {
        jobId: buildQueueJobId(
          'scan-contact',
          input.workspaceId,
          contact.id,
          'smoke',
          smokeTestId,
        ),
        removeOnComplete: true,
      },
    );

    const startedAt = Date.now();
    let result: any = null;
    while (Date.now() - startedAt < waitMs) {
      const current = await this.redisClient.get(smokeKey);
      if (current) {
        try {
          result = JSON.parse(current);
        } catch {
          /* invalid JSON in Redis */
        }
        if (
          [
            'completed',
            'failed',
            'skipped',
            'disabled',
            'billing_suspended',
          ].includes(result.status)
        ) {
          break;
        }
      }
      await this.sleep(500);
    }

    return {
      smokeTestId,
      workspaceId: input.workspaceId,
      workspaceName: workspace.name,
      queued: true,
      mode: input.liveSend ? 'live' : 'dry-run',
      phone,
      message,
      result: result || { status: 'queued' },
      queue: await autopilotQueue.getJobCounts(
        'waiting',
        'active',
        'delayed',
        'failed',
      ),
    };
  }

  async toggleAutopilot(workspaceId: string, enabled: boolean) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const settings = (workspace?.providerSettings as Record<string, any>) || {};

    if (enabled) {
      await this.ensureBillingAllowsAutopilot(workspaceId, settings);
      this.ensureWhatsAppConnectedOrThrow(settings);
    }

    const autopilotCfg = { ...(settings.autopilot || {}), enabled };
    const autonomy = {
      ...(settings.autonomy || {}),
      mode: enabled ? 'LIVE' : 'OFF',
      reactiveEnabled: enabled,
      proactiveEnabled: false,
      reason: enabled ? 'manual_toggle_on' : 'manual_toggle_off',
      lastTransitionAt: new Date().toISOString(),
    };
    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        providerSettings: {
          ...settings,
          autopilot: autopilotCfg,
          autonomy,
        },
      },
    });
    return { workspaceId, enabled };
  }

  private async ensureBillingAllowsAutopilot(
    workspaceId: string,
    settings: any,
  ) {
    const suspended = (settings?.billingSuspended ?? false) === true;
    if (suspended) {
      // Loga evento para rastreabilidade
      try {
        await this.prisma.autopilotEvent.create({
          data: {
            workspaceId,
            intent: 'BILLING',
            action: 'SUSPENDED',
            status: 'skipped',
            reason: 'billing_suspended',
            meta: { source: 'autopilot_service' },
          },
        });
        await this.prisma.auditLog.create({
          data: {
            workspaceId,
            action: 'AUTOPILOT_SUSPENDED',
            resource: 'billing',
            details: { reason: 'billing_suspended' },
          },
        });
      } catch (err) {
        this.logger.warn(
          `Failed to log billing suspension event: ${err?.message}`,
        );
      }
      throw new ForbiddenException(
        'Autopilot suspenso: regularize cobrança para reativar.',
      );
    }

    const sub = await this.prisma.subscription.findUnique({
      where: { workspaceId },
      select: { status: true },
    });

    if (sub && ['CANCELED', 'PAST_DUE'].includes(sub.status)) {
      throw new ForbiddenException(
        `Assinatura ${sub.status}. Regularize o pagamento para ativar o Autopilot.`,
      );
    }
  }

  // Mantido por compatibilidade: vários trechos do Autopilot chamam esse helper.
  private async ensureNotSuspended(workspaceId: string) {
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const settings = (ws?.providerSettings as Record<string, any>) || {};
    await this.ensureBillingAllowsAutopilot(workspaceId, settings);
  }

  private ensureWhatsAppConnectedOrThrow(settings: any) {
    const missing: string[] = [];
    const status = settings?.whatsappApiSession?.status;
    if (status !== 'connected')
      missing.push('whatsappApiSession.status=connected');

    if (missing.length) {
      throw new ForbiddenException(
        `Conecte/configure o WhatsApp antes de ativar o Autopilot. Faltando: ${missing.join(', ')}`,
      );
    }
  }

  async updateConfig(
    workspaceId: string,
    payload: {
      conversionFlowId?: string | null;
      currencyDefault?: string;
      recoveryTemplateName?: string | null;
    },
  ) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const settings = (workspace?.providerSettings as Record<string, any>) || {};
    const autopilotCfg = { ...(settings.autopilot || {}) };
    if (payload.conversionFlowId !== undefined) {
      autopilotCfg.conversionFlowId = payload.conversionFlowId;
    }
    if (payload.currencyDefault) {
      autopilotCfg.currencyDefault = payload.currencyDefault;
    }
    if (payload.recoveryTemplateName !== undefined) {
      autopilotCfg.recoveryTemplateName = payload.recoveryTemplateName;
    }
    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { providerSettings: { ...settings, autopilot: autopilotCfg } },
    });
    return { workspaceId, autopilot: autopilotCfg };
  }

  async getStatus(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const settings = (workspace?.providerSettings as Record<string, any>) || {};
    const billingSuspended = settings.billingSuspended === true;
    const autonomyMode = String(settings?.autonomy?.mode || '').toUpperCase();
    return {
      workspaceId,
      enabled:
        autonomyMode === 'LIVE' ||
        autonomyMode === 'BACKLOG' ||
        autonomyMode === 'FULL' ||
        !!settings.autopilot?.enabled,
      autonomy: settings.autonomy || null,
      billingSuspended,
    };
  }

  async getConfig(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const settings = (workspace?.providerSettings as Record<string, any>) || {};
    return { workspaceId, autopilot: settings.autopilot || {} };
  }

  /**
   * Estatísticas simples do Autopilot baseadas em AutopilotEvent.
   */
  async getStats(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const settings = (workspace?.providerSettings as Record<string, any>) || {};
    const enabled = !!settings.autopilot?.enabled;
    const billingSuspended = settings.billingSuspended === true;

    const now = Date.now();
    const days7 = 7 * 24 * 60 * 60 * 1000;

    // Prefer autopilot events for precisão (ações reais executadas)
    const events = await this.prisma.autopilotEvent.findMany({
      where: {
        workspaceId,
        createdAt: { gte: new Date(now - days7) },
      },
      select: {
        createdAt: true,
        status: true,
        action: true,
        intent: true,
        reason: true,
        meta: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });

    const actionsByType: Record<string, number> = {};
    const timeline: Record<string, number> = {};
    let lastActionAt: string | null = null;
    let errorsLast7d = 0;
    let lastErrorAt: string | null = null;
    const errorReasons: Record<string, number> = {};
    let scheduledCount = 0;
    let nextRetryAt: string | null = null;
    let conversionsLast7d = 0;
    let lastConversionAt: string | null = null;
    let conversionsAmountLast7d = 0;
    let skippedTotal = 0;
    let skippedOptin = 0;
    let skipped24h = 0;

    for (const ev of events) {
      const action = ev.action || 'UNKNOWN';
      actionsByType[action] = (actionsByType[action] || 0) + 1;
      if (ev.status === 'error') {
        errorsLast7d += 1;
        const reason = ev.reason || 'error';
        errorReasons[reason] = (errorReasons[reason] || 0) + 1;
        const tsError = ev.createdAt.getTime();
        if (!lastErrorAt || tsError > new Date(lastErrorAt).getTime()) {
          lastErrorAt = ev.createdAt.toISOString();
        }
      }
      if (ev.status === 'skipped') {
        skippedTotal += 1;
        const reason = (ev.reason || '').toLowerCase();
        if (reason.includes('optin')) skippedOptin += 1;
        if (reason.includes('24h') || reason.includes('session'))
          skipped24h += 1;
      }

      if (ev.status === 'scheduled') {
        scheduledCount += 1;
        const cf = (ev.meta as Record<string, any>)?.nextRetryAt || null;
        if (
          cf &&
          (!nextRetryAt ||
            new Date(cf).getTime() < new Date(nextRetryAt).getTime())
        ) {
          nextRetryAt = cf;
        }
      }
      if (ev.action === 'CONVERSION') {
        conversionsLast7d += 1;
        const tsConv = ev.createdAt.getTime();
        if (
          !lastConversionAt ||
          tsConv > new Date(lastConversionAt).getTime()
        ) {
          lastConversionAt = ev.createdAt.toISOString();
        }
        const amt = (ev.meta as Record<string, any>)?.amount;
        if (amt && !isNaN(Number(amt))) {
          conversionsAmountLast7d += Number(amt);
        }
      }

      const ts = ev.createdAt.getTime();
      const day = ev.createdAt.toISOString().slice(0, 10);
      timeline[day] = (timeline[day] || 0) + 1;
      if (!lastActionAt || ts > new Date(lastActionAt).getTime()) {
        lastActionAt = ev.createdAt.toISOString();
      }
    }

    // Coleta contatos para contagem, mas não duplica métricas se já temos eventos
    const contacts = await this.prisma.contact.findMany({
      where: { workspaceId },
      select: { id: true },
      take: 2000, // proteção básica
    });

    const actionsLast7d = events.length;

    return {
      workspaceId,
      enabled,
      billingSuspended,
      contactsTracked: contacts.length,
      actionsLast7d,
      actionsByType,
      lastActionAt,
      errorsLast7d,
      lastErrorAt,
      errorReasons,
      scheduledCount,
      nextRetryAt,
      conversionsLast7d,
      lastConversionAt,
      conversionsAmountLast7d,
      skippedTotal,
      skippedOptin,
      skipped24h,
      timeline,
    };
  }

  /**
   * Impacto aproximado: analisa respostas após ações do Autopilot (últimos 7 dias).
   * Prefere audit logs (AUTOPILOT_ACTION) e usa customFields como fallback.
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
      if (!current || ts > current) {
        contactActions.set(ev.contactId, ts);
      }
    }

    const contactIds = Array.from(contactActions.keys());
    const contacts = await this.prisma.contact.findMany({
      take: 10000,
      where: { id: { in: contactIds } },
      select: { id: true, phone: true, name: true },
    });
    const contactMap = new Map<
      string,
      { id: string; phone: string; name: string | null }
    >();
    contacts.forEach((c) => contactMap.set(c.id, c));

    const conversionEvents = events.filter((e) => e.action === 'CONVERSION');
    const conversionEventContacts = new Set(
      conversionEvents.map((e) => e.contactId).filter(Boolean),
    );

    const actionsAnalyzed = events.length || contactActions.size;
    let repliedContacts = 0;
    let totalReplies = 0;
    const replyDelays: number[] = [];
    const samples: any[] = [];
    let conversions = conversionEvents.length;

    // Batch: fetch all inbound messages for all contacted IDs at once
    const allContactIds = Array.from(contactActions.keys());
    const minActionTs = allContactIds.length > 0
      ? new Date(Math.min(...Array.from(contactActions.values())))
      : since;

    const paymentKeywords = [
      'paguei', 'pago', 'pix', 'pague', 'comprei', 'compre', 'boleto', 'assinatura',
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
              contactId: { in: allContactIds.filter(id => !conversionEventContacts.has(id)) },
              direction: 'INBOUND',
              createdAt: { gte: minActionTs },
              OR: paymentKeywords.map((kw) => ({
                content: { contains: kw, mode: 'insensitive' },
              })),
            },
            select: { contactId: true },
          })
        : Promise.resolve([]),
    ]);

    // Group inbound messages by contactId
    const inboundByContact = new Map<string, Date[]>();
    for (const msg of inboundMessages) {
      if (!msg.contactId) continue;
      const arr = inboundByContact.get(msg.contactId) || [];
      arr.push(msg.createdAt);
      inboundByContact.set(msg.contactId, arr);
    }
    const conversionContactIds = new Set(conversionMessages.map(m => m.contactId).filter(Boolean));

    for (const [contactId, actionTs] of contactActions.entries()) {
      const msgs = inboundByContact.get(contactId) || [];
      const afterAction = msgs.filter(d => d.getTime() > actionTs);
      if (afterAction.length > 0) {
        repliedContacts += 1;
        totalReplies += afterAction.length;
        const delayMs = afterAction[0].getTime() - actionTs;
        replyDelays.push(delayMs);
        if (samples.length < 5) {
          const contact = contactMap.get(contactId);
          samples.push({
            contactId,
            contact: contact?.name || contact?.phone || contactId,
            replyAt: afterAction[0],
            delayMinutes: Math.round(delayMs / 60000),
          });
        }
      }

      if (!conversionEventContacts.has(contactId) && conversionContactIds.has(contactId)) {
        conversions += 1;
      }
    }

    const replyRate =
      actionsAnalyzed > 0 ? repliedContacts / actionsAnalyzed : 0;
    const conversionRate =
      actionsAnalyzed > 0 ? conversions / actionsAnalyzed : 0;
    const avgReplyMinutes =
      replyDelays.length > 0
        ? Math.round(
            replyDelays.reduce((a, b) => a + b, 0) / replyDelays.length / 60000,
          )
        : null;

    return {
      workspaceId,
      actionsAnalyzed,
      repliedContacts,
      totalReplies,
      replyRate,
      conversions,
      conversionRate,
      avgReplyMinutes,
      samples,
    };
  }

  /**
   * Insights simples do Autopilot (últimos 7 dias)
   */
  async getInsights(workspaceId: string) {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const events = await this.prisma.autopilotEvent.findMany({
      take: 5000,
      where: {
        workspaceId,
        createdAt: { gte: since },
      },
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
      if (e.status === 'error') errors += 1;
      else executed += 1;
    });

    const impact = await this.getImpact(workspaceId);
    const dealsWon = await this.prisma.deal.aggregate({
      where: {
        status: 'WON',
        updatedAt: { gte: since },
        contact: { workspaceId },
      },
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
    const insights = await this.getInsights(workspaceId);
    const timeline = await this.prisma.autopilotEvent
      .groupBy({
        by: ['createdAt'],
        where: {
          workspaceId,
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
        _count: { _all: true },
      })
      .catch(() => []);

    const summary = `
Executed: ${insights.executed}
Errors: ${insights.errors}
ReplyRate: ${(insights.replyRate * 100).toFixed(1)}%
Conversion: ${(insights.conversionRate * 100).toFixed(1)}%
Top intents: ${Object.entries(insights.intents || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, v]) => `${k}:${v}`)
      .join(', ')}
`;

    const apiKey = this.config.get('OPENAI_API_KEY');
    if (!apiKey) {
      return {
        answer: `Resumo:\n${summary}\nPergunta: ${question || 'n/d'}`,
        detail: insights,
      };
    }

    const client = new OpenAI({ apiKey });
    const prompt = `
You are an assistant that summarizes Autopilot performance for a WhatsApp SaaS.
Metrics (7d):
${summary}
Timeline (counts per day, optional): ${JSON.stringify(timeline)}
Question: "${question}"
Answer in Portuguese, short and actionable.`;

    const completion = await callOpenAIWithRetry(() =>
      client.chat.completions.create({
        model: resolveBackendOpenAIModel('writer', this.config),
        messages: [{ role: 'user', content: prompt }],
      }),
    );

    const answer = completion.choices[0]?.message?.content || summary;
    return { answer, detail: insights };
  }

  /**
   * Relatório de campanhas Money Machine (7d) com receita atribuída por telefone.
   */
  async getMoneyReport(workspaceId: string) {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const campaigns = await this.prisma.campaign.findMany({
      where: { workspaceId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    // Receita agregada (deals + invoices)
    const dealsWon = await this.prisma.deal.findMany({
      where: {
        status: 'WON',
        updatedAt: { gte: since },
        contact: { workspaceId },
      },
      select: { value: true },
      take: 1000,
    });
    const revenueFromDeals = dealsWon.reduce(
      (acc, d) => acc + (Number(d.value) || 0),
      0,
    );

    const invoices = await this.prisma.invoice.findMany({
      where: { workspaceId, status: 'PAID', createdAt: { gte: since } },
      select: { amount: true },
      take: 1000,
    });
    const revenueFromInvoices = invoices.reduce(
      (acc, inv) => acc + (Number(inv.amount) || 0),
      0,
    );

    // Conversões registradas
    let conversions = 0;
    try {
      const client = this.prisma as Record<string, any>;
      if (client.autopilotEvent) {
        conversions = await client.autopilotEvent.count({
          where: {
            workspaceId,
            action: 'CONVERSION',
            createdAt: { gte: since },
          },
        });
      }
    } catch {
      // optional table
    }

    const rows = [];

    for (const camp of campaigns) {
      const filters: any = camp.filters || {};
      const phones: string[] = Array.isArray(filters.phones)
        ? filters.phones
        : [];
      let revenue = 0;
      let deals = 0;

      // PULSE:OK — each campaign has unique JSON path filter on customFields; cannot batch
      const taggedContacts = await this.prisma.contact.findMany({
        take: 500,
        where: {
          workspaceId,
          customFields: { path: ['lastCampaignId'], equals: camp.id },
        },
        select: { id: true },
      });

      const contactIds =
        taggedContacts.length > 0
          ? taggedContacts.map((c) => c.id)
          : phones.length
            ? (
                await this.prisma.contact.findMany({
                  take: 500,
                  where: { workspaceId, phone: { in: phones } },
                  select: { id: true },
                })
              ).map((c) => c.id)
            : [];

      // Prioriza eventos de receita registrados (DEAL_WON/DEAL_WON_STAGE) para esta campanha
      // Prefer deals com sourceCampaignId
      const directAgg = await this.prisma.deal.aggregate({
        where: {
          status: 'WON',
          updatedAt: { gte: since },
          sourceCampaignId: camp.id,
          contact: { workspaceId },
        },
        _sum: { value: true },
        _count: { id: true },
      });
      revenue = directAgg._sum?.value || 0;
      deals = directAgg._count?.id || 0;

      // Eventos registrados (metadados) complementam
      if (deals === 0) {
        const evs = await this.prisma.autopilotEvent.findMany({
          take: 1000,
          where: {
            workspaceId,
            action: { in: ['DEAL_WON', 'DEAL_WON_STAGE'] },
            createdAt: { gte: since },
            meta: { path: ['campaignId'], equals: camp.id },
          },
          select: { meta: true },
        });
        if (evs.length) {
          revenue += evs.reduce(
            (acc, e: any) => acc + (Number(e.meta?.value) || 0),
            0,
          );
          deals += evs.length;
        }
      }

      // Fallback: contatos marcados
      if (deals === 0 && revenue === 0 && contactIds.length) {
        const agg = await this.prisma.deal.aggregate({
          where: {
            status: 'WON',
            updatedAt: { gte: since },
            contactId: { in: contactIds },
          },
          _sum: { value: true },
          _count: { id: true },
        });
        revenue = agg._sum?.value || 0;
        deals = agg._count?.id || 0;
      }

      rows.push({
        id: camp.id,
        name: camp.name,
        status: camp.status,
        createdAt: camp.createdAt,
        phones: phones.length,
        revenue,
        deals,
        // se houve receita via eventos (meta.value), revenue reflete a soma; fallback usa deals contatos
      });
    }

    const campaignsMap = campaigns.map((c) => ({ id: c.id, name: c.name }));
    return {
      workspaceId,
      rows,
      campaigns: campaignsMap,
      summary: {
        revenueFromDeals,
        revenueFromInvoices,
        conversionsLast7d: conversions,
      },
    };
  }

  /**
   * Lista eventos de receita (deals ganhos) dos últimos 7 dias
   */
  async getRevenueEvents(workspaceId: string, limit = 20) {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const max = Math.min(Math.max(limit, 5), 200);
    const events: any[] = [];

    try {
      const client = this.prisma as Record<string, any>;
      if (client.autopilotEvent) {
        const ev = await client.autopilotEvent.findMany({
          where: {
            workspaceId,
            action: { in: ['DEAL_WON', 'DEAL_WON_STAGE', 'CONVERSION'] },
            createdAt: { gte: since },
          },
          orderBy: { createdAt: 'desc' },
          take: max,
          select: { createdAt: true, meta: true, action: true },
        });
        events.push(
          ...ev.map((e: any) => {
            const meta: any = e.meta || {};
            return {
              at: e.createdAt,
              campaignId: meta.campaignId || '',
              value: Number(meta.value || 0),
              action: e.action,
              source: meta.source || '',
            };
          }),
        );
      }
    } catch {
      // optional table
    }

    // Fallback em deals se não houver eventos
    if (events.length === 0) {
      const dealsWon = await this.prisma.deal.findMany({
        where: {
          status: 'WON',
          updatedAt: { gte: since },
          contact: { workspaceId },
        },
        orderBy: { updatedAt: 'desc' },
        take: max,
        select: {
          updatedAt: true,
          value: true,
          stage: { select: { pipeline: true } },
        },
      });
      events.push(
        ...dealsWon.map((d) => ({
          at: d.updatedAt,
          campaignId: '',
          value: Number(d.value || 0),
          action: 'DEAL_WON',
          source: 'deal',
        })),
      );
    }

    const totalRevenue = events.reduce((acc, ev) => acc + (ev.value || 0), 0);
    const totalDeals = events.length;

    return { events, totalRevenue, totalDeals };
  }

  /**
   * Lista ações recentes do Autopilot (para debug/UX).
   */
  async getRecentActions(workspaceId: string, limit = 30, status?: string) {
    const events = await this.prisma.autopilotEvent.findMany({
      where: {
        workspaceId,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 5), 100),
      select: {
        createdAt: true,
        contactId: true,
        intent: true,
        action: true,
        status: true,
        reason: true,
        meta: true,
      },
    });

    const contactIds = Array.from(
      new Set(events.map((l) => l.contactId).filter(Boolean)),
    );
    const contacts = await this.prisma.contact.findMany({
      take: 5000,
      where: { id: { in: contactIds }, workspaceId },
      select: { id: true, phone: true, name: true, customFields: true },
    });
    const map = new Map(contacts.map((c) => [c.id, c]));

    return events.map((l) => {
      const contact = l.contactId ? map.get(l.contactId) : null;
      const nextRetryAt =
        (contact?.customFields as Record<string, any>)?.autopilotNextRetryAt ||
        null;
      const meta = l.meta as Record<string, any>;
      return {
        createdAt: l.createdAt,
        contact: contact?.name || contact?.phone || l.contactId,
        contactId: l.contactId,
        contactPhone: contact?.phone || null,
        action: l.action || 'UNKNOWN',
        intent: l.intent || 'UNKNOWN',
        status: l.status || 'executed',
        reason: l.reason || '',
        nextRetryAt,
        intentConfidence: meta?.confidence ?? meta?.intentConfidence ?? null,
        meta: l.meta || null,
      };
    });
  }

  /**
   * Enfileira processamento do Autopilot no worker (escala horizontal).
   */
  async enqueueProcessing(input: {
    workspaceId: string;
    phone?: string;
    contactId?: string;
    message?: string;
    delayMs?: number;
  }) {
    await this.ensureNotSuspended(input.workspaceId);
    const { workspaceId, phone, contactId, message, delayMs } = input;
    if (!phone && !contactId) {
      throw new BadRequestException('phone ou contactId são obrigatórios');
    }
    await autopilotQueue.add(
      'scan-contact',
      {
        workspaceId,
        contactId,
        phone,
        messageContent: message || '',
      },
      {
        ...(delayMs && delayMs > 0 ? { delay: delayMs } : {}),
        ...(contactId || phone
          ? {
              jobId: buildQueueJobId(
                'scan-contact',
                workspaceId,
                contactId || phone,
                randomUUID(),
              ),
            }
          : {}),
      },
    );
    return { queued: true };
  }

  /**
   * Retry com guardas simples: limita erros por contato em 1h e aplica cooldown.
   */
  async retryContact(workspaceId: string, contactId: string) {
    await this.ensureNotSuspended(workspaceId);
    const now = Date.now();
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: { customFields: true },
    });
    const cf: any = contact?.customFields || {};
    const nextRetryAt = cf.autopilotNextRetryAt
      ? new Date(cf.autopilotNextRetryAt).getTime()
      : 0;
    if (nextRetryAt && nextRetryAt > now) {
      return {
        queued: false,
        reason: 'retry_already_scheduled',
        nextRetryAt: new Date(nextRetryAt).toISOString(),
      };
    }

    const errorsLastHour = await this.prisma.autopilotEvent.count({
      where: {
        workspaceId,
        contactId,
        status: 'error',
        createdAt: { gte: new Date(now - 60 * 60 * 1000) },
      },
    });
    if (errorsLastHour >= 3) {
      const delayMs = 30 * 60 * 1000;
      await this.enqueueProcessing({ workspaceId, contactId, delayMs });
      const nextRetry = new Date(now + delayMs).toISOString();
      await this.prisma.contact.update({
        where: { id: contactId },
        data: {
          customFields: {
            ...((cf || {}) as Record<string, unknown>),
            autopilotNextRetryAt: nextRetry,
          },
        },
      });
      await this.prisma.autopilotEvent.create({
        data: {
          workspaceId,
          contactId,
          intent: 'RETRY',
          action: 'SCHEDULED',
          status: 'scheduled',
          reason: 'rate_limited_error_1h',
          meta: { nextRetryAt: nextRetry },
        },
      });
      return {
        queued: true,
        scheduled: true,
        delayMs,
        reason: 'rate_limited_error_1h',
        nextRetryAt: nextRetry,
      };
    }

    const lastEvent = await this.prisma.autopilotEvent.findFirst({
      where: { workspaceId, contactId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (lastEvent) {
      const sinceLast = now - new Date(lastEvent.createdAt).getTime();
      if (sinceLast < 5 * 60 * 1000) {
        const delayMs = 5 * 60 * 1000 - sinceLast;
        await this.enqueueProcessing({ workspaceId, contactId, delayMs });
        const nextRetry = new Date(now + delayMs).toISOString();
        await this.prisma.contact.update({
          where: { id: contactId },
          data: {
            customFields: {
              ...((cf || {}) as Record<string, unknown>),
              autopilotNextRetryAt: nextRetry,
            },
          },
        });
        await this.prisma.autopilotEvent.create({
          data: {
            workspaceId,
            contactId,
            intent: 'RETRY',
            action: 'SCHEDULED',
            status: 'scheduled',
            reason: 'cooldown_5m',
            meta: { nextRetryAt: nextRetry },
          },
        });
        return {
          queued: true,
          scheduled: true,
          delayMs,
          reason: 'cooldown_5m',
          nextRetryAt: nextRetry,
        };
      }
    }

    await this.enqueueProcessing({ workspaceId, contactId });
    await this.prisma.contact.update({
      where: { id: contactId },
      data: {
        customFields: {
          ...((cf || {}) as Record<string, unknown>),
          autopilotNextRetryAt: null,
        },
      },
    });
    return { queued: true, scheduled: false };
  }

  /**
   * Marca conversão manual/webhook e registra evento CONVERSION.
   */
  async markConversion(input: {
    workspaceId: string;
    contactId?: string;
    phone?: string;
    reason?: string;
    meta?: Record<string, any>;
  }) {
    await this.ensureNotSuspended(input.workspaceId);
    const { workspaceId, contactId, phone, reason, meta } = input;
    let contactIdResolved = contactId;

    // Idempotência por orderId (se disponível)
    const orderId = meta?.orderId;
    if (orderId) {
      try {
        const existing = await this.prisma.autopilotEvent.findFirst({
          where: {
            workspaceId,
            action: 'CONVERSION',
            meta: { path: ['orderId'], equals: orderId },
          },
          select: { id: true, contactId: true },
        });
        if (existing) {
          return { ok: true, contactId: existing.contactId, deduped: true };
        }
      } catch {
        // fallback para evitar bloquear caso o filtro JSON falhe
      }
    }

    if (!contactIdResolved && phone) {
      const normalized = phone.replace(/\D/g, '');
      const contact = await this.prisma.contact.findUnique({
        where: {
          workspaceId_phone: {
            workspaceId,
            phone: normalized,
          },
        },
      });
      contactIdResolved = contact?.id || undefined;
    }

    await this.prisma.autopilotEvent.create({
      data: {
        workspaceId,
        contactId: contactIdResolved,
        intent: 'BUYING',
        action: 'CONVERSION',
        status: 'executed',
        reason: reason || 'webhook_conversion',
        meta: meta || {},
      },
    });

    let contactPhone = input.phone;
    if (contactIdResolved) {
      const contact = await this.prisma.contact.update({
        where: { id: contactIdResolved },
        data: { purchaseProbability: 'HIGH', sentiment: 'POSITIVE' },
        select: { phone: true },
      });
      contactPhone = contact.phone || contactPhone;
    }

    // Dispara flow de pós-conversão se configurado
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });
    const settings: any = ws?.providerSettings || {};
    const flowId = settings?.autopilot?.conversionFlowId;
    if (flowId && (contactIdResolved || contactPhone)) {
      await flowQueue.add('run-flow', {
        workspaceId,
        flowId,
        user: contactPhone || contactIdResolved,
        initialVars: {
          source: 'autopilot_conversion',
          amount: meta?.amount,
          orderId: meta?.orderId,
          provider: meta?.provider,
        },
      });
    }

    return { ok: true, contactId: contactIdResolved };
  }

  /**
   * Dispara fluxo pós-compra para upsell/onboarding do cliente.
   * Chamado pelos webhooks de pagamento após confirmação.
   */
  async triggerPostPurchaseFlow(
    workspaceId: string,
    contactId: string,
    purchaseInfo: {
      provider: string;
      amount?: number;
      productName?: string;
      orderId?: string;
    },
  ) {
    await this.ensureNotSuspended(workspaceId);

    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true, phone: true, name: true },
    });

    if (!contact?.phone) {
      this.logger.warn(`[PostPurchase] Contact ${contactId} sem telefone`);
      return { triggered: false, reason: 'no_phone' };
    }

    // Buscar configuração de fluxo pós-compra
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });

    const settings: any = ws?.providerSettings || {};
    const postPurchaseFlowId = settings?.autopilot?.postPurchaseFlowId;

    // Se tem fluxo configurado, executa
    if (postPurchaseFlowId) {
      await flowQueue.add('run-flow', {
        workspaceId,
        flowId: postPurchaseFlowId,
        user: contact.phone,
        initialVars: {
          source: 'post_purchase',
          contactName: contact.name || 'Cliente',
          ...purchaseInfo,
        },
      });

      this.logger.log(
        `[PostPurchase] Flow ${postPurchaseFlowId} triggered for ${contact.phone}`,
      );
      return { triggered: true, flowId: postPurchaseFlowId };
    }

    // Sem fluxo: enviar mensagem padrão de agradecimento
    const thankYouMessage = purchaseInfo.productName
      ? `Obrigado pela sua compra de *${purchaseInfo.productName}*. Em breve você receberá mais informações.`
      : `Obrigado pela sua compra. Estamos preparando tudo para você.`;

    await flowQueue.add('send-message', {
      workspaceId,
      to: contact.phone,
      user: contact.phone,
      message: thankYouMessage,
    });

    // Registrar evento
    await this.prisma.autopilotEvent.create({
      data: {
        workspaceId,
        contactId,
        intent: 'BUYING',
        action: 'POST_PURCHASE',
        status: 'executed',
        reason: 'payment_confirmed',
        meta: purchaseInfo,
      },
    });

    return { triggered: true, defaultMessage: true };
  }

  /**
   * Envia uma mensagem direta do Autopilot (ex.: Next-Best-Action) para um contato.
   */
  async sendDirectMessage(
    workspaceId: string,
    contactId: string,
    message: string,
  ) {
    await this.ensureNotSuspended(workspaceId);
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: {
        id: true,
        phone: true,
        customFields: true,
        tags: { select: { name: true } },
      },
    });
    if (!contact?.phone) {
      throw new BadRequestException('Contato sem telefone para envio');
    }

    const compliance = await this.ensureCompliance(workspaceId, contact, []);
    if (!compliance.allowed) {
      await this.prisma.autopilotEvent.create({
        data: {
          workspaceId,
          contactId,
          intent: 'NBA',
          action: 'MANUAL_SEND',
          status: 'skipped',
          reason: compliance.reason,
          meta: { compliance: true },
        },
      });
      return { queued: false, reason: compliance.reason };
    }

    // Enfileira envio no flowQueue para respeitar anti-ban/limites
    await flowQueue.add('send-message', {
      workspaceId,
      to: contact.phone,
      user: contact.phone,
      message,
    });

    await this.prisma.autopilotEvent.create({
      data: {
        workspaceId,
        contactId,
        intent: 'NBA',
        action: 'MANUAL_SEND',
        status: 'executed',
        reason: 'next_best_action',
        meta: { channel: 'whatsapp', message, compliance: false },
      },
    });

    return { queued: true };
  }

  // Main Cycle - Runs every X minutes (via Cron or manual trigger)
  async runAutopilotCycle(workspaceId: string) {
    if (!this.isLegacyExecutionEnabled()) {
      this.logger.warn(
        `[Autopilot] Legacy backend cycle disabled for workspace ${workspaceId}; worker runtime is the single execution source.`,
      );
      return {
        status: 'disabled',
        reason: 'legacy_backend_autopilot_disabled',
      };
    }

    await this.ensureNotSuspended(workspaceId);
    this.logger.log(`[Autopilot] Starting cycle for workspace ${workspaceId}`);

    // 1. Reactive: Handle unread/open conversations
    await this.handleReactive(workspaceId);

    // 2. Proactive: "Money Engineer" mode (find lost leads)
    await this.handleProactive(workspaceId);

    return { status: 'Cycle Completed' };
  }

  /**
   * Máquina de Dinheiro: escaneia conversas abertas e cria 3 campanhas prontas.
   * - Reativação
   * - Oferta Secreta
   * - Sequência de Fechamento
   */
  async moneyMachine(
    workspaceId: string,
    topN = 200,
    autoSend = false,
    useSmartTime = false,
  ) {
    if (!this.isLegacyExecutionEnabled()) {
      this.logger.warn(
        `[Autopilot] Legacy backend money machine disabled for workspace ${workspaceId}; worker runtime is the single execution source.`,
      );
      return {
        created: [],
        segments: {
          hot: 0,
          warm: 0,
          cold: 0,
        },
        autoSend,
        scheduledAt: null,
        status: 'disabled',
        reason: 'legacy_backend_autopilot_disabled',
      };
    }

    await this.ensureNotSuspended(workspaceId);
    const convs = await this.prisma.conversation.findMany({
      where: { workspaceId, status: 'OPEN' },
      orderBy: { updatedAt: 'desc' },
      take: Math.min(Math.max(topN, 50), 500),
      include: {
        contact: { select: { phone: true, name: true } },
        messages: { take: 1, orderBy: { createdAt: 'desc' } },
      },
    });

    const hot: string[] = [];
    const warm: string[] = [];
    const cold: string[] = [];

    for (const conv of convs) {
      const last = conv.messages[0];
      if (!last) continue;
      const ageH = (Date.now() - last.createdAt.getTime()) / 3600000;
      const text = (last.content || '').toLowerCase();
      const isBuying =
        text.includes('preco') ||
        text.includes('preço') ||
        text.includes('valor') ||
        text.includes('quanto') ||
        text.includes('pix') ||
        text.includes('boleto');
      if (isBuying) hot.push(conv.contact.phone);
      else if (ageH > 72) cold.push(conv.contact.phone);
      else warm.push(conv.contact.phone);
    }

    const makeMsg = (title: string, body: string) => `[#${title}] ${body}`;

    const reactivation = await this.prisma.campaign.create({
      data: {
        name: 'Reativação Automática',
        status: autoSend ? 'SCHEDULED' : 'DRAFT',
        messageTemplate: makeMsg(
          'REACT',
          'Voltei aqui porque reservei uma condição especial pra você. Quer que eu envie agora?',
        ),
        filters: { phones: [...warm, ...cold] },
        stats: { sent: 0, replied: 0 },
        workspaceId,
        aiStrategy: 'SOFT',
      },
    });

    const secret = await this.prisma.campaign.create({
      data: {
        name: 'Oferta Secreta',
        status: autoSend ? 'SCHEDULED' : 'DRAFT',
        messageTemplate: makeMsg(
          'SECRET',
          'Consegui um bônus secreto só hoje. Se eu te mandar agora, você topa avaliar? Responda SIM.',
        ),
        filters: { phones: hot },
        stats: { sent: 0, replied: 0 },
        workspaceId,
        aiStrategy: 'AGGRESSIVE',
      },
    });

    const closing = await this.prisma.campaign.create({
      data: {
        name: 'Sequência de Fechamento',
        status: autoSend ? 'SCHEDULED' : 'DRAFT',
        messageTemplate: makeMsg(
          'CLOSE',
          'Último passo: posso finalizar pra você agora com tudo configurado? Responda “fechar” que eu te mando o link.',
        ),
        filters: { phones: hot },
        stats: { sent: 0, replied: 0 },
        workspaceId,
        aiStrategy: 'BALANCED',
      },
    });

    const createdIds = [reactivation.id, secret.id, closing.id];

    let scheduledAt: Date | null = null;

    if (autoSend) {
      const delay = await this.computeSmartDelay(workspaceId, useSmartTime);
      scheduledAt = delay > 0 ? new Date(Date.now() + delay) : new Date();
      // Enqueue all campaigns
      for (const id of createdIds) {
        // PULSE:OK — queue.add is not a Prisma query; must be sequential per BullMQ contract
        await this.campaignQueue.add(
          'process-campaign',
          { campaignId: id, workspaceId },
          { delay },
        );
      }

      // Batch update all campaigns to SCHEDULED
      await this.prisma.campaign.updateMany({
        where: { id: { in: createdIds } },
        data: {
          status: 'SCHEDULED',
          scheduledAt: delay > 0 ? new Date(Date.now() + delay) : null,
        },
      });

      // Batch create audit logs
      await this.prisma.auditLog.createMany({
        data: createdIds.map((id) => ({
          workspaceId,
          action: 'MONEY_MACHINE_LAUNCH',
          resource: 'Campaign',
          resourceId: id,
          details: { autoSend: true, useSmartTime, delayMs: delay },
        })),
      });
    }

    return {
      created: createdIds,
      segments: {
        hot: hot.length,
        warm: warm.length,
        cold: cold.length,
      },
      autoSend,
      scheduledAt,
    };
  }

  private async computeSmartDelay(workspaceId: string, useSmartTime: boolean) {
    if (!useSmartTime) return 0;
    const bestTime = await this.smartTime.getBestTime(workspaceId);
    const now = new Date();
    const currentHour = now.getHours();
    const targetHour = bestTime.bestHour;
    let hoursToAdd = targetHour - currentHour;
    if (hoursToAdd <= 0) hoursToAdd += 24;
    return hoursToAdd * 60 * 60 * 1000;
  }

  /**
   * Configuração operacional do Autopilot (janela, limites, thresholds)
   */
  getRuntimeConfig() {
    const num = (val: string | undefined, fallback: number) => {
      const n = Number(val);
      return Number.isFinite(n) ? n : fallback;
    };

    return {
      windowStart: num(process.env.AUTOPILOT_WINDOW_START, 8),
      windowEnd: num(process.env.AUTOPILOT_WINDOW_END, 22),
      silenceHours: num(process.env.AUTOPILOT_SILENCE_HOURS, 24),
      cycleLimit: num(process.env.AUTOPILOT_CYCLE_LIMIT, 200),
      contactDailyLimit: num(process.env.AUTOPILOT_CONTACT_DAILY_LIMIT, 5),
      workspaceDailyLimit: num(
        process.env.AUTOPILOT_WORKSPACE_DAILY_LIMIT,
        1000,
      ),
      queueThreshold: num(process.env.AUTOPILOT_QUEUE_WAITING_THRESHOLD, 200),
    };
  }

  async getQueueStats() {
    const counts = await autopilotQueue.getJobCounts();
    return {
      waiting: counts.waiting || 0,
      delayed: counts.delayed || 0,
      active: counts.active || 0,
      failed: counts.failed || 0,
      completed: counts.completed || 0,
    };
  }

  private async handleReactive(workspaceId: string) {
    const conversations = await this.prisma.conversation.findMany({
      where: { workspaceId, status: 'OPEN', unreadCount: { gt: 0 } },
      include: {
        messages: { take: 5, orderBy: { createdAt: 'desc' } },
        contact: true,
      },
      take: 100,
      orderBy: { lastMessageAt: 'desc' },
    });

    const bestTime = await this.smartTime.getBestTime(workspaceId);
    const currentHour = new Date().getHours();
    const isOptimalTime =
      currentHour === bestTime.bestHour ||
      (currentHour >= bestTime.bestHour - 1 &&
        currentHour <= bestTime.bestHour + 1);

    for (const conv of conversations) {
      await this.processConversation(conv, isOptimalTime);
    }
  }

  private async handleProactive(workspaceId: string) {
    // "Money Engineer": Find leads who went silent after a buying signal or price inquiry
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h silence

    const stalled = await this.prisma.conversation.findMany({
      where: {
        workspaceId,
        status: 'OPEN',
        lastMessageAt: { lt: cutoff },
        unreadCount: 0, // We replied, they didn't
      },
      include: {
        messages: { take: 5, orderBy: { createdAt: 'desc' } },
        contact: true,
      },
      take: 50,
      orderBy: { lastMessageAt: 'desc' },
    });

    const bestTime = await this.smartTime.getBestTime(workspaceId);
    const currentHour = new Date().getHours();
    if (Math.abs(currentHour - bestTime.bestHour) > 3) {
      this.logger.log(
        `[Autopilot] Skipping proactive mode. Current hour ${currentHour} is too far from optimal ${bestTime.bestHour}`,
      );
      return;
    }

    for (const conv of stalled) {
      const isHot = true; // Mock score
      if (isHot) {
        await this.executeAction('lead_unlocker', conv);
      }
    }
  }

  private async processConversation(conv: any, isOptimalTime: boolean) {
    const lastMsg = conv.messages[0];
    if (!lastMsg || lastMsg.direction === 'OUTBOUND') return;

    const analysis = await this.analyzeContext(conv.messages);
    const action = this.decideAction(analysis, conv, isOptimalTime);

    if (action !== 'wait') {
      await this.executeAction(action, conv, analysis);
    }
  }

  private async analyzeContext(messages: any[]) {
    if (!this.openai)
      return { intent: 'unknown', sentiment: 'neutral', buyingSignal: false };

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

    const completion = await callOpenAIWithRetry(() =>
      this.openai.chat.completions.create({
        model: resolveBackendOpenAIModel('brain', this.config),
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      }),
    );

    let analysisResult: any = {
      intent: 'unknown',
      sentiment: 'neutral',
      buyingSignal: false,
    };
    try {
      analysisResult = JSON.parse(
        completion.choices[0]?.message?.content || '{}',
      );
    } catch {
      /* invalid JSON from model */
    }
    return analysisResult;
  }

  private decideAction(
    analysis: any,
    conv: any,
    isOptimalTime: boolean,
  ): string {
    const { intent, sentiment, buyingSignal, stage } = analysis;
    const hour = new Date().getHours();
    const isNight = hour > 22 || hour < 7;

    if (isNight) {
      if (buyingSignal) return 'soft_close_night';
      return 'auto_reply_night';
    }

    if (buyingSignal) {
      if (isOptimalTime) return 'send_offer';
      return 'send_offer_soft';
    }

    if (intent === 'question_price') return 'send_price';
    if (intent === 'scheduling') return 'send_calendar';
    if (intent === 'complaint') return 'handover_human';
    if (intent === 'objection') return 'handle_objection';

    if (stage === 'new') return 'qualify';
    if (stage === 'closing') {
      if (sentiment === 'positive' && !buyingSignal) return 'try_upsell';
      return 'send_cta';
    }

    return 'ai_chat';
  }

  private async executeAction(action: string, conv: any, analysis?: any) {
    this.logger.log(`[Autopilot] Executing ${action} for ${conv.id}`);

    const compliance = await this.ensureCompliance(
      conv.workspaceId,
      conv.contact,
      conv.messages,
    );
    if (!compliance.allowed) {
      this.logger.warn(
        `[Autopilot] Skip compliance for ${conv.contact?.id || conv.contactId}: ${compliance.reason}`,
      );
      try {
        await this.prisma.autopilotEvent.create({
          data: {
            workspaceId: conv.workspaceId,
            contactId: conv.contact?.id,
            intent: analysis?.intent || 'UNKNOWN',
            action,
            status: 'skipped',
            reason: compliance.reason,
            meta: { compliance: true },
          },
        });
      } catch {
        // optional table
      }
      return;
    }

    let responseText = '';

    switch (action) {
      case 'send_offer':
        responseText = await this.generateResponse('offer', conv, analysis);
        break;
      case 'send_offer_soft':
        responseText = await this.generateResponse(
          'offer_soft',
          conv,
          analysis,
        );
        break;
      case 'send_price':
        responseText = await this.generateResponse('price', conv, analysis);
        break;
      case 'follow_up':
        responseText = await this.generateResponse('follow_up', conv, analysis);
        break;
      case 'lead_unlocker':
        responseText = await this.generateResponse(
          'lead_unlocker',
          conv,
          analysis,
        );
        break;
      case 'handle_objection':
        responseText = await this.generateResponse('objection', conv, analysis);
        break;
      case 'qualify':
        responseText = await this.generateResponse('qualify', conv, analysis);
        break;
      case 'try_upsell':
        responseText = await this.generateResponse('upsell', conv, analysis);
        break;
      case 'send_calendar':
        responseText =
          'Vou te enviar meu link de agenda para marcarmos um horário: https://cal.com/danielpenin (Exemplo)';
        break;
      case 'soft_close_night':
        responseText =
          'Oi! Vi seu interesse. Já deixei tudo preparado para você. Amanhã cedo eu retomo para concluirmos, tudo bem?';
        break;
      case 'auto_reply_night':
        responseText =
          'Opa! Agora estou offline, mas já anotei sua dúvida. Amanhã 8h te respondo sem falta!';
        break;
      case 'ai_chat':
        responseText = await this.generateResponse('chat', conv, analysis);
        break;
      case 'handover_human':
        return;
      default:
        return;
    }

    if (responseText) {
      this.logger.log(`[Autopilot] Sent: "${responseText}"`);
      try {
        // Enfileira envio real no worker para respeitar anti-ban/limites
        await flowQueue.add('send-message', {
          workspaceId: conv.workspaceId,
          to: conv.contact.phone,
          user: conv.contact.phone,
          message: responseText,
        });
      } catch (err: any) {
        this.logger.warn(
          `[Autopilot] Falha ao enfileirar envio: ${err?.message}`,
        );
      }
    }
  }

  private async generateResponse(type: string, conv: any, analysis: any) {
    if (!this.openai) return 'Olá, como posso ajudar?';

    const templates = {
      offer:
        'Generate an irresistible offer closing for this context. Create Urgency. Keep it short.',
      offer_soft:
        'Generate a gentle offer closing. Focus on value, no pressure.',
      price: 'Explain the price/value proposition. Be direct but persuasive.',
      follow_up:
        'Re-engage this lead who went silent. Be polite but intriguing.',
      lead_unlocker:
        "The lead disappeared. Send a 'mental trigger' question to unlock them (e.g., 'Did you give up on X?'). Short and punchy.",
      objection: "Overcome the user's objection with empathy and authority.",
      qualify: 'Ask a qualifying question to understand their needs better.',
      upsell: 'Suggest a complementary product or upgrade (Upsell) naturally.',
      chat: "Reply naturally to the user's last message. Be helpful and concise.",
    };

    const prompt = `
    You are a top-tier sales assistant on WhatsApp.
    Context: User is ${analysis?.intent || 'interested'}.
    Task: ${templates[type] || templates.chat}
    Last Message: ${conv.messages[0]?.content}
    
    Write the WhatsApp message response (Portuguese Brazil). No quotes.
    `;

    const completion = await callOpenAIWithRetry(() =>
      this.openai.chat.completions.create({
        model: resolveBackendOpenAIModel('writer', this.config),
        messages: [{ role: 'user', content: prompt }],
      }),
    );

    return completion.choices[0]?.message?.content;
  }

  /**
   * Compliance guardrails: opt-in e janela 24h.
   */
  private async ensureCompliance(
    workspaceId: string,
    contact: any,
    messages: any[],
  ): Promise<{ allowed: boolean; reason?: string }> {
    const enforceOptIn =
      process.env.ENFORCE_OPTIN === 'true' ||
      contact?.workspace?.providerSettings?.autopilot?.requireOptIn === true;
    const enforce24h =
      (process.env.AUTOPILOT_ENFORCE_24H ?? 'false').toLowerCase() !== 'false';

    let fullContact = contact;
    if (enforceOptIn && (!contact?.tags || !Array.isArray(contact.tags))) {
      fullContact = await this.prisma.contact.findUnique({
        where: { id: contact?.id },
        select: {
          id: true,
          customFields: true,
          tags: { select: { name: true } },
        },
      });
    }

    if (enforceOptIn) {
      const tags = (fullContact?.tags || []).map((t: any) =>
        t.name?.toLowerCase(),
      );
      const cf: any = fullContact?.customFields || {};
      const hasOptIn =
        tags.includes('optin_whatsapp') ||
        cf.optin === true ||
        cf.optin_whatsapp === true;
      if (!hasOptIn) {
        return { allowed: false, reason: 'optin_required' };
      }
    }

    if (enforce24h) {
      // Usa últimas mensagens em memória; fallback para busca rápida
      const lastInbound =
        messages?.find((m: any) => m.direction === 'INBOUND') ||
        (await this.prisma.message.findFirst({
          where: { workspaceId, contactId: contact?.id, direction: 'INBOUND' },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }));
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      if (!lastInbound || new Date(lastInbound.createdAt).getTime() < cutoff) {
        return { allowed: false, reason: 'session_expired_24h' };
      }
    }

    return { allowed: true };
  }

  /**
   * Next-Best-Action simples para um contato específico (heurística leve).
   */
  async nextBestAction(workspaceId: string, contactId: string) {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true, phone: true, name: true },
    });
    if (!contact) {
      throw new NotFoundException('Contato não encontrado');
    }

    const conv = await this.prisma.conversation.findFirst({
      where: { workspaceId, contactId },
      include: {
        messages: { orderBy: { createdAt: 'desc' }, take: 3 },
      },
    });

    const last = conv?.messages?.[0];
    const lastText = (last?.content || '').toLowerCase();
    const ageMinutes = last
      ? Math.round((Date.now() - new Date(last.createdAt).getTime()) / 60000)
      : null;

    const hasKeyword = (...keys: string[]) =>
      keys.some((k) => lastText.includes(k));

    let action = 'FOLLOW_UP_SOFT';
    let reason = 'keep_warm';
    let message =
      'Oi! Só checando se posso te ajudar em algo ou se prefere que eu volte mais tarde.';

    if (
      last &&
      last.direction === 'INBOUND' &&
      hasKeyword('preço', 'valor', 'quanto', 'custa', 'pix', 'boleto')
    ) {
      action = 'GHOST_CLOSER';
      reason = 'buying_signal';
      message =
        'Consigo te garantir a condição especial agora. Quer que eu finalize e te envie o link?';
    } else if (
      last &&
      last.direction === 'OUTBOUND' &&
      ageMinutes &&
      ageMinutes > 720
    ) {
      action = 'REACTIVATE';
      reason = 'long_silence';
      message =
        'Voltei com uma novidade só pra você: preparei uma condição especial se retomarmos hoje. Quer ver?';
    } else if (!last) {
      action = 'INTRO';
      reason = 'no_history';
      message =
        'Olá! Sou seu assistente. Posso te mandar uma condição especial ou entender melhor sua necessidade?';
    }

    return {
      workspaceId,
      contactId,
      contact: contact.name || contact.phone,
      action,
      reason,
      recommendedMessage: message,
      lastMessageAt: last?.createdAt || null,
    };
  }
}
