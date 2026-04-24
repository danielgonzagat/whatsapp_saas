import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { PrismaService } from '../prisma/prisma.service';
import { AutopilotAnalyticsInsightsService } from './autopilot-analytics-insights.service';
import { AutopilotAnalyticsReportService } from './autopilot-analytics-report.service';

/** Analytics for Autopilot: stats delegated to report/insights companion services. */
@Injectable()
export class AutopilotAnalyticsService {
  private readonly logger = new Logger(AutopilotAnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly planLimits: PlanLimitsService,
    private readonly report: AutopilotAnalyticsReportService,
    private readonly insights: AutopilotAnalyticsInsightsService,
  ) {}

  private readRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  }

  private readOptionalText(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
  }

  /**
   * Estatísticas simples do Autopilot baseadas em AutopilotEvent.
   */
  async getStats(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const settings = (workspace?.providerSettings as Record<string, unknown>) || {};
    const enabled = !!(settings.autopilot as Record<string, unknown>)?.enabled;
    const billingSuspended = settings.billingSuspended === true;

    const now = Date.now();
    const days7 = 7 * 24 * 60 * 60 * 1000;

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
        if (reason.includes('optin')) {
          skippedOptin += 1;
        }
        if (reason.includes('24h') || reason.includes('session')) {
          skipped24h += 1;
        }
      }

      if (ev.status === 'scheduled') {
        scheduledCount += 1;
        const cf = this.readOptionalText(this.readRecord(ev.meta).nextRetryAt);
        if (cf && (!nextRetryAt || new Date(cf).getTime() < new Date(nextRetryAt).getTime())) {
          nextRetryAt = cf;
        }
      }
      if (ev.action === 'CONVERSION') {
        conversionsLast7d += 1;
        const tsConv = ev.createdAt.getTime();
        if (!lastConversionAt || tsConv > new Date(lastConversionAt).getTime()) {
          lastConversionAt = ev.createdAt.toISOString();
        }
        const amt = (ev.meta as Record<string, unknown>)?.amount;
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

    const contacts = await this.prisma.contact.findMany({
      where: { workspaceId },
      select: { id: true },
      take: 2000,
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
   * Impacto aproximado — delegated to AutopilotAnalyticsInsightsService.
   */
  async getImpact(workspaceId: string) {
    return this.insights.getImpact(workspaceId);
  }

  /** Get insights summary — delegated to AutopilotAnalyticsInsightsService. */
  async getInsights(workspaceId: string) {
    return this.insights.getInsights(workspaceId);
  }

  /**
   * InsightBot — delegated to AutopilotAnalyticsInsightsService.
   */
  async askInsights(workspaceId: string, question: string) {
    return this.insights.askInsights(workspaceId, question);
  }

  /**
   * Relatório de campanhas Money Machine (7d) — delegated to AutopilotAnalyticsReportService.
   */
  async getMoneyReport(workspaceId: string) {
    return this.report.getMoneyReport(workspaceId);
  }

  /**
   * Lista eventos de receita (deals ganhos) — delegated to AutopilotAnalyticsReportService.
   */
  async getRevenueEvents(workspaceId: string, limit = 20) {
    return this.report.getRevenueEvents(workspaceId, limit);
  }

  /**
   * Lista ações recentes do Autopilot — delegated to AutopilotAnalyticsReportService.
   */
  async getRecentActions(workspaceId: string, limit = 30, status?: string) {
    return this.report.getRecentActions(workspaceId, limit, status);
  }

  serializeRecentAction(
    event: Parameters<AutopilotAnalyticsReportService['serializeRecentAction']>[0],
    contactMap: Parameters<AutopilotAnalyticsReportService['serializeRecentAction']>[1],
  ) {
    return this.report.serializeRecentAction(event, contactMap);
  }
}
