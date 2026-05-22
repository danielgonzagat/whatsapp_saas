import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { PrismaService } from '../prisma/prisma.service';
import { AutopilotAnalyticsInsightsService } from './autopilot-analytics-insights.service';
import { AutopilotAnalyticsReportService } from './autopilot-analytics-report.service';

/** Analytics for Autopilot: stats delegated to report/insights companion services. */
@Injectable()
/**
 * @cluster whatsapp_saas/backend/autopilot
 * L11 multi-agent TaskGraph annotation (batched by tools/auto-pr/batch-job.mjs).
 */
export class AutopilotAnalyticsService {
  private readonly logger = StructuredLogger.from(AutopilotAnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly report: AutopilotAnalyticsReportService,
    private readonly insights: AutopilotAnalyticsInsightsService,
  ) {
    this.logger.log('AutopilotAnalyticsService initialized');
  }

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

    const acc = this.createStatsAccumulator();
    for (const ev of events) {
      this.processStatsEvent(ev, acc);
    }

    const contacts = await this.prisma.contact.findMany({
      where: { workspaceId },
      select: { id: true },
      take: 2000,
    });

    return {
      workspaceId,
      enabled,
      billingSuspended,
      contactsTracked: contacts.length,
      actionsLast7d: events.length,
      actionsByType: acc.actionsByType,
      lastActionAt: acc.lastActionAt,
      errorsLast7d: acc.errorsLast7d,
      lastErrorAt: acc.lastErrorAt,
      errorReasons: acc.errorReasons,
      scheduledCount: acc.scheduledCount,
      nextRetryAt: acc.nextRetryAt,
      conversionsLast7d: acc.conversionsLast7d,
      lastConversionAt: acc.lastConversionAt,
      conversionsAmountLast7d: acc.conversionsAmountLast7d,
      skippedTotal: acc.skippedTotal,
      skippedOptin: acc.skippedOptin,
      skipped24h: acc.skipped24h,
      timeline: acc.timeline,
    };
  }

  private createStatsAccumulator() {
    return {
      actionsByType: {} as Record<string, number>,
      timeline: {} as Record<string, number>,
      lastActionAt: null as string | null,
      errorsLast7d: 0,
      lastErrorAt: null as string | null,
      errorReasons: {} as Record<string, number>,
      scheduledCount: 0,
      nextRetryAt: null as string | null,
      conversionsLast7d: 0,
      lastConversionAt: null as string | null,
      conversionsAmountLast7d: 0,
      skippedTotal: 0,
      skippedOptin: 0,
      skipped24h: 0,
    };
  }

  private processStatsEvent(
    ev: {
      createdAt: Date;
      status?: string | null;
      action?: string | null;
      reason?: string | null;
      meta?: unknown;
    },
    acc: ReturnType<AutopilotAnalyticsService['createStatsAccumulator']>,
  ) {
    const action = ev.action || 'UNKNOWN';
    acc.actionsByType[action] = (acc.actionsByType[action] || 0) + 1;

    this.processStatsError(ev, acc);
    this.processStatsSkip(ev, acc);
    this.processStatsScheduled(ev, acc);
    this.processStatsConversion(ev, acc);

    const ts = ev.createdAt.getTime();
    const day = ev.createdAt.toISOString().slice(0, 10);
    acc.timeline[day] = (acc.timeline[day] || 0) + 1;
    if (!acc.lastActionAt || ts > new Date(acc.lastActionAt).getTime()) {
      acc.lastActionAt = ev.createdAt.toISOString();
    }
  }

  private processStatsError(
    ev: { createdAt: Date; status?: string | null; reason?: string | null },
    acc: ReturnType<AutopilotAnalyticsService['createStatsAccumulator']>,
  ) {
    if (ev.status !== 'error') {
      return;
    }
    acc.errorsLast7d += 1;
    const reason = ev.reason || 'error';
    acc.errorReasons[reason] = (acc.errorReasons[reason] || 0) + 1;
    const tsError = ev.createdAt.getTime();
    if (!acc.lastErrorAt || tsError > new Date(acc.lastErrorAt).getTime()) {
      acc.lastErrorAt = ev.createdAt.toISOString();
    }
  }

  private processStatsSkip(
    ev: { reason?: string | null; status?: string | null },
    acc: ReturnType<AutopilotAnalyticsService['createStatsAccumulator']>,
  ) {
    if (ev.status !== 'skipped') {
      return;
    }
    acc.skippedTotal += 1;
    const reason = (ev.reason || '').toLowerCase();
    if (reason.includes('optin')) {
      acc.skippedOptin += 1;
    }
    if (reason.includes('24h') || reason.includes('session')) {
      acc.skipped24h += 1;
    }
  }

  private processStatsScheduled(
    ev: { status?: string | null; meta?: unknown },
    acc: ReturnType<AutopilotAnalyticsService['createStatsAccumulator']>,
  ) {
    if (ev.status !== 'scheduled') {
      return;
    }
    acc.scheduledCount += 1;
    const cf = this.readOptionalText(this.readRecord(ev.meta).nextRetryAt);
    if (cf && (!acc.nextRetryAt || new Date(cf).getTime() < new Date(acc.nextRetryAt).getTime())) {
      acc.nextRetryAt = cf;
    }
  }

  private processStatsConversion(
    ev: { status?: string | null; action?: string | null; createdAt: Date; meta?: unknown },
    acc: ReturnType<AutopilotAnalyticsService['createStatsAccumulator']>,
  ) {
    if (ev.action !== 'CONVERSION') {
      return;
    }
    acc.conversionsLast7d += 1;
    const tsConv = ev.createdAt.getTime();
    if (!acc.lastConversionAt || tsConv > new Date(acc.lastConversionAt).getTime()) {
      acc.lastConversionAt = ev.createdAt.toISOString();
    }
    const amt = (ev.meta as Record<string, unknown>)?.amount;
    if (amt && !isNaN(Number(amt))) {
      acc.conversionsAmountLast7d += Number(amt);
    }
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
