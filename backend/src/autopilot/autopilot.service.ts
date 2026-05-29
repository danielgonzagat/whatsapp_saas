import { BadRequestException, ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { Prisma } from '@prisma/client';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import { PrismaService } from '../prisma/prisma.service';
import { flowQueue } from '../queue/queue';
import { AutopilotAnalyticsService } from './autopilot-analytics.service';
import { AutopilotCycleService } from './autopilot-cycle.service';
import { AutopilotOpsService } from './autopilot-ops.service';
import {
  applyAutopilotConfigPatch,
  buildAutonomyPatch,
  buildAutopilotEnabledPatch,
  buildPostPurchaseMessage,
  coerceFlowIdLabel,
  computeStatusEnabled,
  getPostPurchaseFlowId,
  isBillingSuspended,
  isWhatsAppConnected,
  readRecord,
} from './autopilot.helpers';

/** Autopilot orchestration service — delegates to sub-services. */
@Injectable()
/**
 * @cluster whatsapp_saas/backend/autopilot
 * L11 multi-agent TaskGraph annotation (batched by tools/auto-pr/batch-job.mjs).
 */
export class AutopilotService {
  private readonly logger = StructuredLogger.from(AutopilotService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AutopilotAnalyticsService,
    private readonly cycle: AutopilotCycleService,
    private readonly ops: AutopilotOpsService,
    private readonly planLimits: PlanLimitsService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  // ─── Analytics delegation ──────────────────────────────────────────────────

  async getStats(...args: Parameters<AutopilotAnalyticsService['getStats']>) {
    return this.analytics.getStats(...args);
  }

  async getImpact(...args: Parameters<AutopilotAnalyticsService['getImpact']>) {
    return this.analytics.getImpact(...args);
  }

  async getInsights(...args: Parameters<AutopilotAnalyticsService['getInsights']>) {
    return this.analytics.getInsights(...args);
  }

  async askInsights(...args: Parameters<AutopilotAnalyticsService['askInsights']>) {
    return this.analytics.askInsights(...args);
  }

  async getMoneyReport(...args: Parameters<AutopilotAnalyticsService['getMoneyReport']>) {
    return this.analytics.getMoneyReport(...args);
  }

  async getRevenueEvents(...args: Parameters<AutopilotAnalyticsService['getRevenueEvents']>) {
    return this.analytics.getRevenueEvents(...args);
  }

  async getRecentActions(...args: Parameters<AutopilotAnalyticsService['getRecentActions']>) {
    return this.analytics.getRecentActions(...args);
  }

  // ─── Cycle delegation ──────────────────────────────────────────────────────

  async runAutopilotCycle(...args: Parameters<AutopilotCycleService['runAutopilotCycle']>) {
    return this.cycle.runAutopilotCycle(...args);
  }

  async moneyMachine(...args: Parameters<AutopilotCycleService['moneyMachine']>) {
    return this.cycle.moneyMachine(...args);
  }

  getRuntimeConfig(...args: Parameters<AutopilotCycleService['getRuntimeConfig']>) {
    return this.cycle.getRuntimeConfig(...args);
  }

  async getQueueStats(...args: Parameters<AutopilotCycleService['getQueueStats']>) {
    return this.cycle.getQueueStats(...args);
  }

  async nextBestAction(...args: Parameters<AutopilotCycleService['nextBestAction']>) {
    return this.cycle.nextBestAction(...args);
  }

  async ensureCompliance(...args: Parameters<AutopilotCycleService['ensureCompliance']>) {
    return this.cycle.ensureCompliance(...args);
  }

  // ─── Ops delegation ────────────────────────────────────────────────────────

  async getPipelineStatus(...args: Parameters<AutopilotOpsService['getPipelineStatus']>) {
    return this.ops.getPipelineStatus(...args);
  }

  async runSmokeTest(...args: Parameters<AutopilotOpsService['runSmokeTest']>) {
    return this.ops.runSmokeTest(...args);
  }

  async enqueueProcessing(...args: Parameters<AutopilotOpsService['enqueueProcessing']>) {
    return this.ops.enqueueProcessing(...args);
  }

  async retryContact(...args: Parameters<AutopilotOpsService['retryContact']>) {
    return this.ops.retryContact(...args);
  }

  async markConversion(...args: Parameters<AutopilotOpsService['markConversion']>) {
    return this.ops.markConversion(...args);
  }

  // ─── Core methods (owned by this service) ─────────────────────────────────

  private async ensureBillingAllowsAutopilot(
    workspaceId: string,
    settings: Record<string, unknown>,
  ) {
    const suspended = isBillingSuspended(settings);
    if (suspended) {
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
      } catch (err: unknown) {
        this.logger.warn(
          `Failed to log billing suspension event: ${err instanceof Error ? err.message : 'unknown error'}`,
        );
        void this.opsAlert?.alertOnCriticalError(
          err,
          'AutopilotService.ensureBillingAllowsAutopilot',
          {
            workspaceId,
          },
        );
      }
      throw new ForbiddenException('Autopilot suspenso: regularize cobrança para reativar.');
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

  private async ensureNotSuspended(workspaceId: string) {
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const settings = (ws?.providerSettings as Record<string, unknown>) || {};
    await this.ensureBillingAllowsAutopilot(workspaceId, settings);
  }

  private ensureWhatsAppConnectedOrThrow(settings: Record<string, unknown>) {
    if (!isWhatsAppConnected(settings)) {
      throw new ForbiddenException(
        'Conecte/configure o WhatsApp antes de ativar o Autopilot. Faltando: whatsappApiSession.status=connected',
      );
    }
  }

  /** Toggle autopilot. */
  async toggleAutopilot(workspaceId: string, enabled: boolean) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const settings = readRecord(workspace?.providerSettings);

    if (enabled) {
      await this.ensureBillingAllowsAutopilot(workspaceId, settings);
      this.ensureWhatsAppConnectedOrThrow(settings);
    }

    const autopilotCfg = buildAutopilotEnabledPatch(readRecord(settings.autopilot), enabled);
    const autonomy = buildAutonomyPatch(
      readRecord(settings.autonomy),
      enabled,
      new Date().toISOString(),
    );
    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        providerSettings: {
          ...settings,
          autopilot: autopilotCfg,
          autonomy,
        } as Prisma.InputJsonValue,
      },
    });
    return { workspaceId, enabled };
  }

  /** Toggle autopilot via DTO (capability `toggle_autopilot`). */
  async toggle(workspaceId: string, dto: { enabled: boolean }) {
    return this.toggleAutopilot(workspaceId, dto.enabled);
  }

  /** Update config. */
  async updateConfig(
    workspaceId: string,
    payload: {
      conversionFlowId?: string | null;
      currencyDefault?: string;
      recoveryTemplateName?: string | null;
    },
  ) {
    const startedAt = Date.now();
    const operation = 'autopilot/config';
    try {
      const workspace = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { providerSettings: true },
      });
      const settings = readRecord(workspace?.providerSettings);
      const autopilotCfg = applyAutopilotConfigPatch(readRecord(settings.autopilot), payload);
      await this.prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          providerSettings: {
            ...settings,
            autopilot: autopilotCfg,
          } as Prisma.InputJsonValue,
        },
      });
      const result = { workspaceId, autopilot: autopilotCfg };
      this.logger.log(
        { workspaceId, operation, durationMs: Date.now() - startedAt, status: 'ok' },
        'Autopilot config succeeded',
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
        'Autopilot config failed',
      );
      throw error;
    }
  }

  /** Get status. */
  async getStatus(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const settings = readRecord(workspace?.providerSettings);
    return {
      workspaceId,
      enabled: computeStatusEnabled(settings),
      autonomy: (settings.autonomy as Record<string, unknown>) || null,
      billingSuspended: isBillingSuspended(settings),
    };
  }

  /** Get config. */
  async getConfig(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const settings = readRecord(workspace?.providerSettings);
    return { workspaceId, autopilot: readRecord(settings.autopilot) };
  }

  /**
   * Dispara fluxo pós-compra para upsell/onboarding do cliente.
   */
  async triggerPostPurchaseFlow(
    workspaceId: string,
    contactId: string,
    purchaseInfo: {
      provider: string;
      amount?: number | undefined;
      productName?: string | undefined;
      orderId?: string | undefined;
    },
  ) {
    await this.ensureNotSuspended(workspaceId);

    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, workspaceId },
      select: { id: true, phone: true, name: true },
    });

    if (!contact?.phone) {
      this.logger.warn(`[PostPurchase] Contact ${contactId} sem telefone`);
      return { triggered: false, reason: 'no_phone' };
    }

    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });

    const settings = readRecord(ws?.providerSettings);
    const postPurchaseFlowId = getPostPurchaseFlowId(settings);

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
        `[PostPurchase] Flow ${coerceFlowIdLabel(postPurchaseFlowId)} triggered for ${contact.phone}`,
      );
      return { triggered: true, flowId: postPurchaseFlowId };
    }

    const thankYouMessage = buildPostPurchaseMessage(purchaseInfo.productName);

    await this.planLimits.ensureDailyMessageQuota(workspaceId);
    await this.planLimits.ensureMessageRate(workspaceId);

    await flowQueue.add('send-message', {
      workspaceId,
      to: contact.phone,
      user: contact.phone,
      message: thankYouMessage,
    });

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
   * Envia uma mensagem direta do Autopilot (NBA) para um contato.
   */
  async sendDirectMessage(workspaceId: string, contactId: string, message: string) {
    await this.ensureNotSuspended(workspaceId);
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, workspaceId },
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

    const compliance = await this.cycle.ensureCompliance(workspaceId, contact, []);
    if (!compliance.allowed) {
      await this.prisma.autopilotEvent.create({
        data: {
          workspaceId,
          contactId,
          intent: 'NBA',
          action: 'MANUAL_SEND',
          status: 'skipped',
          ...(compliance.reason !== undefined ? { reason: compliance.reason } : {}),
          meta: { compliance: true },
        },
      });
      return { queued: false, reason: compliance.reason };
    }

    await this.planLimits.ensureDailyMessageQuota(workspaceId);
    await this.planLimits.ensureMessageRate(workspaceId);

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
}
