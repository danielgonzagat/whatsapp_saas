import { ForbiddenException, Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildQueueJobId } from '../queue/job-id.util';
import { autopilotQueue, flowQueue } from '../queue/queue';
import { OpsAlertService } from '../observability/ops-alert.service';

const D_RE_CONV = /\D/g;

/**
 * Autopilot retry and conversion helpers extracted from AutopilotOpsService.
 * Keeps AutopilotOpsService under 400 lines.
 */
@Injectable()
export class AutopilotOpsConversionService {
  private readonly logger = new Logger(AutopilotOpsConversionService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  private readRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  }

  private readOptionalText(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
  }

  private async ensureNotSuspended(workspaceId: string) {
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const settings = (ws?.providerSettings as Record<string, unknown>) || {};
    if ((settings?.billingSuspended ?? false) === true) {
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

  private async enqueueProcessing(input: {
    workspaceId: string;
    contactId?: string;
    phone?: string;
    delayMs?: number;
  }) {
    const { workspaceId, contactId, phone, delayMs } = input;
    await autopilotQueue.add(
      'scan-contact',
      { workspaceId, contactId, phone, messageContent: '' },
      {
        ...(delayMs && delayMs > 0 ? { delay: delayMs } : {}),
        ...(contactId || phone
          ? { jobId: buildQueueJobId('scan-contact', workspaceId, contactId || phone) }
          : {}),
      },
    );
  }

  /** Retry com guardas simples. */
  async retryContact(workspaceId: string, contactId: string) {
    const startedAt = Date.now();
    const operation = 'autopilot/retry';
    try {
      await this.ensureNotSuspended(workspaceId);
      const now = Date.now();
      const contact = await this.prisma.contact.findFirst({
        where: { id: contactId, workspaceId },
        select: { customFields: true },
      });
      const cf = this.readRecord(contact?.customFields);
      const nextRetryAtValue = this.readOptionalText(cf.autopilotNextRetryAt);
      // PULSE_OK: nextRetryAt from customFields — fallback to 0 if parse fails (NaN||0 = 0, guarded by `if(nextRetryAt)` below)
      const nextRetryAt = nextRetryAtValue ? new Date(nextRetryAtValue).getTime() : 0;
      if (nextRetryAt && nextRetryAt > now) {
        const result = {
          queued: false,
          reason: 'retry_already_scheduled',
          nextRetryAt: new Date(nextRetryAt).toISOString(),
        };
        this.logger.log(
          { workspaceId, contactId, operation, durationMs: Date.now() - startedAt, status: 'ok' },
          'Autopilot retry succeeded (already scheduled)',
        );
        return result;
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
        await this.prisma.contact.updateMany({
          where: { id: contactId, workspaceId },
          data: { customFields: { ...(cf || {}), autopilotNextRetryAt: nextRetry } },
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
        const result = {
          queued: true,
          scheduled: true,
          delayMs,
          reason: 'rate_limited_error_1h',
          nextRetryAt: nextRetry,
        };
        this.logger.log(
          { workspaceId, contactId, operation, durationMs: Date.now() - startedAt, status: 'ok' },
          'Autopilot retry succeeded (rate-limited)',
        );
        return result;
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
          await this.prisma.contact.updateMany({
            where: { id: contactId, workspaceId },
            data: { customFields: { ...(cf || {}), autopilotNextRetryAt: nextRetry } },
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
          const result = {
            queued: true,
            scheduled: true,
            delayMs,
            reason: 'cooldown_5m',
            nextRetryAt: nextRetry,
          };
          this.logger.log(
            { workspaceId, contactId, operation, durationMs: Date.now() - startedAt, status: 'ok' },
            'Autopilot retry succeeded (cooldown)',
          );
          return result;
        }
      }

      await this.enqueueProcessing({ workspaceId, contactId });
      await this.prisma.contact.updateMany({
        where: { id: contactId, workspaceId },
        data: { customFields: { ...(cf || {}), autopilotNextRetryAt: null } },
      });
      const result = { queued: true, scheduled: false };
      this.logger.log(
        { workspaceId, contactId, operation, durationMs: Date.now() - startedAt, status: 'ok' },
        'Autopilot retry succeeded',
      );
      return result;
    } catch (error: unknown) {
      this.logger.error(
        {
          workspaceId,
          contactId,
          operation,
          durationMs: Date.now() - startedAt,
          errorCode: (error as Record<string, unknown>)?.code,
          errorName: error instanceof Error ? error.constructor.name : 'Error',
          status: 'error',
        },
        error instanceof Error ? error.stack : undefined,
        'Autopilot retry failed',
      );
      throw error;
    }
  }

  /** Marca conversão manual/webhook e registra evento CONVERSION. */
  async markConversion(input: {
    workspaceId: string;
    contactId?: string;
    phone?: string;
    reason?: string;
    meta?: Record<string, unknown>;
  }) {
    const startedAt = Date.now();
    const operation = 'autopilot/conversion';
    try {
      await this.ensureNotSuspended(input.workspaceId);
      const { workspaceId, contactId, phone, reason, meta } = input;
      let contactIdResolved = contactId;

      const orderId = this.readOptionalText(meta?.orderId);
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
            const result = { ok: true, contactId: existing.contactId, deduped: true };
            this.logger.log(
              { workspaceId, operation, durationMs: Date.now() - startedAt, status: 'ok' },
              'Autopilot conversion succeeded (deduped)',
            );
            return result;
          }
        } catch {
          /* fallback */
        }
      }

      if (!contactIdResolved && phone) {
        const normalized = phone.replace(D_RE_CONV, '');
        const contact = await this.prisma.contact.findUnique({
          where: { workspaceId_phone: { workspaceId, phone: normalized } },
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
          meta: (meta || {}) as Prisma.InputJsonValue,
        },
      });

      let contactPhone = input.phone;
      if (contactIdResolved) {
        await this.prisma.contact.updateMany({
          where: { id: contactIdResolved, workspaceId },
          data: { purchaseProbability: 'HIGH', sentiment: 'POSITIVE' },
        });
        const contact = await this.prisma.contact.findFirst({
          where: { id: contactIdResolved, workspaceId },
          select: { phone: true },
        });
        contactPhone = contact.phone || contactPhone;
      }

      const ws = await this.prisma.workspace.findUnique({ where: { id: workspaceId } });
      const settings = this.readRecord(ws?.providerSettings);
      const flowId = this.readRecord(settings.autopilot).conversionFlowId;
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

      const result = { ok: true, contactId: contactIdResolved };
      this.logger.log(
        {
          workspaceId,
          contactId: contactIdResolved,
          operation,
          durationMs: Date.now() - startedAt,
          status: 'ok',
        },
        'Autopilot conversion succeeded',
      );
      return result;
    } catch (error: unknown) {
      this.logger.error(
        {
          workspaceId: input.workspaceId,
          contactId: input.contactId,
          operation,
          durationMs: Date.now() - startedAt,
          errorCode: (error as Record<string, unknown>)?.code,
          errorName: error instanceof Error ? error.constructor.name : 'Error',
          status: 'error',
        },
        error instanceof Error ? error.stack : undefined,
        'Autopilot conversion failed',
      );
      throw error;
    }
  }
}
