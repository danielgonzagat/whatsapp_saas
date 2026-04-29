import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import { PrismaService } from '../prisma/prisma.service';
import { flowQueue } from '../queue/queue';
import { AutopilotAnalyticsService } from './autopilot-analytics.service';
import { AutopilotCycleService } from './autopilot-cycle.service';
import { AutopilotOpsService } from './autopilot-ops.service';

/** Autopilot orchestration service — delegates to sub-services. */
@Injectable()
export class AutopilotService {
  private readonly logger = new Logger(AutopilotService.name);

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

  private readRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  }

  private async ensureBillingAllowsAutopilot(
    workspaceId: string,
    settings: Record<string, unknown>,
  ) {
    const suspended = (settings?.billingSuspended ?? false) === true;
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
    const status = (settings?.whatsappApiSession as Record<string, unknown>)?.status;
    if (status !== 'connected') {
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
    const settings = this.readRecord(workspace?.providerSettings);

    if (enabled) {
      await this.ensureBillingAllowsAutopilot(workspaceId, settings);
      this.ensureWhatsAppConnectedOrThrow(settings);
    }

    const autopilotCfg = { ...((settings.autopilot as Record<string, unknown>) || {}), enabled };
    const autonomy = {
      ...((settings.autonomy as Record<string, unknown>) || {}),
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

  /** Update config. */
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
    const settings = (workspace?.providerSettings as Record<string, unknown>) || {};
    const autopilotCfg = { ...((settings.autopilot as Record<string, unknown>) || {}) };
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
      data: {
        providerSettings: {
          ...settings,
          autopilot: autopilotCfg,
        } as Prisma.InputJsonValue,
      },
    });
    return { workspaceId, autopilot: autopilotCfg };
  }

  /** Get status. */
  async getStatus(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const settings = (workspace?.providerSettings as Record<string, unknown>) || {};
    const billingSuspended = settings.billingSuspended === true;
    const rawAutonomyMode = (settings?.autonomy as Record<string, unknown>)?.mode;
    const autonomyMode = (typeof rawAutonomyMode === 'string' ? rawAutonomyMode : '').toUpperCase();
    return {
      workspaceId,
      enabled:
        autonomyMode === 'LIVE' ||
        autonomyMode === 'BACKLOG' ||
        autonomyMode === 'FULL' ||
        !!(settings.autopilot as Record<string, unknown>)?.enabled,
      autonomy: (settings.autonomy as Record<string, unknown>) || null,
      billingSuspended,
    };
  }

  /** Get config. */
  async getConfig(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const settings = (workspace?.providerSettings as Record<string, unknown>) || {};
    return { workspaceId, autopilot: (settings.autopilot as Record<string, unknown>) || {} };
  }

  /**
   * Dispara fluxo pós-compra para upsell/onboarding do cliente.
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

    const settings = this.readRecord(ws?.providerSettings);
    const postPurchaseFlowId = this.readRecord(settings.autopilot).postPurchaseFlowId;

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

      const flowIdLabel = typeof postPurchaseFlowId === 'string' ? postPurchaseFlowId : 'unknown';
      this.logger.log(`[PostPurchase] Flow ${flowIdLabel} triggered for ${contact.phone}`);
      return { triggered: true, flowId: postPurchaseFlowId };
    }

    const thankYouMessage = purchaseInfo.productName
      ? `Obrigado pela sua compra de *${purchaseInfo.productName}*. Seu acesso e os próximos passos seguem pelo canal cadastrado.`
      : `Obrigado pela sua compra. Seu acesso e os próximos passos seguem pelo canal cadastrado.`;

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
          reason: compliance.reason,
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
