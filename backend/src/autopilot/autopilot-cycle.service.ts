import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { SmartTimeService } from '../analytics/smart-time/smart-time.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { forEachSequential } from '../common/async-sequence';
import { PrismaService } from '../prisma/prisma.service';
import { autopilotQueue } from '../queue/queue';
import {
  AutopilotCycleExecutorService,
  AutopilotConversation,
} from './autopilot-cycle-executor.service';
import { AutopilotCycleMoneyService } from './autopilot-cycle-money.service';

/** Legacy autopilot execution cycle: conversation processing, compliance. */
@Injectable()
export class AutopilotCycleService {
  private readonly logger = new Logger(AutopilotCycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly smartTime: SmartTimeService,
    private readonly planLimits: PlanLimitsService,
    private readonly money: AutopilotCycleMoneyService,
    private readonly executor: AutopilotCycleExecutorService,
  ) {}

  private isLegacyExecutionEnabled() {
    return process.env.ENABLE_LEGACY_BACKEND_AUTOPILOT === 'true';
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  }

  private async ensureNotSuspended(workspaceId: string) {
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const settings = (ws?.providerSettings as Record<string, unknown>) || {};
    const suspended = (settings?.billingSuspended ?? false) === true;
    if (suspended) {
      throw new Error('Autopilot suspenso: regularize cobrança para reativar.');
    }

    const sub = await this.prisma.subscription.findUnique({
      where: { workspaceId },
      select: { status: true },
    });
    if (sub && ['CANCELED', 'PAST_DUE'].includes(sub.status)) {
      throw new Error(`Assinatura ${sub.status}. Regularize o pagamento para ativar o Autopilot.`);
    }
  }

  /** Get queue stats. */
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

  /**
   * Configuração operacional do Autopilot (janela, limites, thresholds).
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
      workspaceDailyLimit: num(process.env.AUTOPILOT_WORKSPACE_DAILY_LIMIT, 1000),
      queueThreshold: num(process.env.AUTOPILOT_QUEUE_WAITING_THRESHOLD, 200),
    };
  }

  /** Main Cycle - Runs every X minutes (via Cron or manual trigger). */
  async runAutopilotCycle(workspaceId: string) {
    const startedAt = Date.now();
    const operation = 'autopilot/process';
    try {
      if (!this.isLegacyExecutionEnabled()) {
        this.logger.warn(
          `[Autopilot] Legacy backend cycle disabled for workspace ${workspaceId}; worker runtime is the single execution source.`,
        );
        const result = {
          status: 'disabled',
          reason: 'legacy_backend_autopilot_disabled',
        };
        this.logger.log(
          { workspaceId, operation, durationMs: Date.now() - startedAt, status: 'disabled' },
          'Autopilot process succeeded (disabled)',
        );
        return result;
      }

      await this.ensureNotSuspended(workspaceId);
      this.logger.log(`[Autopilot] Starting cycle for workspace ${workspaceId}`);

      await this.handleReactive(workspaceId);
      await this.handleProactive(workspaceId);

      const result = { status: 'Cycle Completed' };
      this.logger.log(
        { workspaceId, operation, durationMs: Date.now() - startedAt, status: 'ok' },
        'Autopilot process succeeded',
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
        'Autopilot process failed',
      );
      throw error;
    }
  }

  /**
   * Máquina de Dinheiro — delegated to AutopilotCycleMoneyService.
   */
  async moneyMachine(workspaceId: string, topN = 200, autoSend = false, useSmartTime = false) {
    await this.ensureNotSuspended(workspaceId);
    return this.money.moneyMachine(workspaceId, topN, autoSend, useSmartTime);
  }

  /**
   * Next-Best-Action — delegated to AutopilotCycleMoneyService.
   */
  async nextBestAction(workspaceId: string, contactId: string) {
    return this.money.nextBestAction(workspaceId, contactId);
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
      currentHour === bestTime.peakHour ||
      (currentHour >= bestTime.peakHour - 1 && currentHour <= bestTime.peakHour + 1);

    await forEachSequential(conversations, async (conv) => {
      await this.processConversation(conv, isOptimalTime);
    });
  }

  private async handleProactive(workspaceId: string) {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const stalled = await this.prisma.conversation.findMany({
      where: {
        workspaceId,
        status: 'OPEN',
        lastMessageAt: { lt: cutoff },
        unreadCount: 0,
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
    if (Math.abs(currentHour - bestTime.peakHour) > 3) {
      this.logger.log(
        `[Autopilot] Skipping proactive mode. Current hour ${currentHour} is too far from optimal ${bestTime.peakHour}`,
      );
      return;
    }

    await forEachSequential(stalled, async (conv) => {
      const lastMsg = conv.messages[0];
      if (!lastMsg) {
        return;
      }
      const text = (lastMsg.content || '').toLowerCase();
      const ageHours = (Date.now() - lastMsg.createdAt.getTime()) / 3600000;

      const isHot =
        lastMsg.direction === 'INBOUND' &&
        ageHours < 168 &&
        (text.includes('preço') ||
          text.includes('preco') ||
          text.includes('valor') ||
          text.includes('quanto') ||
          text.includes('pix') ||
          text.includes('boleto') ||
          text.includes('comprar') ||
          text.includes('quero'));
      if (isHot) {
        const compliance = await this.ensureCompliance(
          conv.workspaceId,
          conv.contact,
          conv.messages,
        );
        await this.executor.executeAction('lead_unlocker', conv, compliance);
      }
    });
  }

  private async processConversation(conv: AutopilotConversation, isOptimalTime: boolean) {
    const lastMsg = conv.messages[0];
    if (!lastMsg || lastMsg.direction === 'OUTBOUND') {
      return;
    }

    const analysis = await this.executor.analyzeContext(conv.messages);
    const action = this.executor.decideAction(analysis, conv, isOptimalTime);

    if (action !== 'wait') {
      const compliance = await this.ensureCompliance(conv.workspaceId, conv.contact, conv.messages);
      await this.executor.executeAction(action, conv, compliance, analysis);
    }
  }

  /**
   * Compliance guardrails: opt-in e janela 24h.
   */
  async ensureCompliance(
    workspaceId: string,
    contact:
      | AutopilotConversation['contact']
      | {
          id: string;
          phone: string;
          tags?: Array<{ name: string }>;
          customFields?: Prisma.JsonValue;
        },
    messages: Array<{ direction: string; createdAt: Date }>,
  ): Promise<{ allowed: boolean; reason?: string }> {
    const enforceOptIn =
      process.env.ENFORCE_OPTIN === 'true' ||
      this.readRecord(
        this.readRecord((contact as AutopilotConversation['contact'])?.workspace).providerSettings,
      ).autopilot === true;
    const enforce24h = (process.env.AUTOPILOT_ENFORCE_24H ?? 'false').toLowerCase() !== 'false';

    let fullContact: {
      id?: string;
      tags?: Array<{ name: string }>;
      customFields?: Prisma.JsonValue;
    } | null = contact;
    if (enforceOptIn && (!contact?.tags || !Array.isArray(contact.tags))) {
      fullContact = await this.prisma.contact.findFirst({
        where: { id: contact?.id, workspaceId },
        select: {
          id: true,
          customFields: true,
          tags: { select: { name: true } },
        },
      });
    }

    if (enforceOptIn) {
      const tags = (fullContact?.tags || []).map((t) => t.name?.toLowerCase());
      const cf = (fullContact?.customFields as Record<string, unknown>) || {};
      const hasOptIn =
        tags.includes('optin_whatsapp') || cf.optin === true || cf.optin_whatsapp === true;
      if (!hasOptIn) {
        return { allowed: false, reason: 'optin_required' };
      }
    }

    if (enforce24h) {
      const lastInbound =
        messages?.find((m) => m.direction === 'INBOUND') ||
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
}
