import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildQueueJobId } from '../queue/job-id.util';
import { autopilotQueue, flowQueue } from '../queue/queue';

const D_RE_CONV = /\D/g;

/**
 * Autopilot retry and conversion helpers extracted from AutopilotOpsService.
 * Keeps AutopilotOpsService under 400 lines.
 */
@Injectable()
export class AutopilotOpsConversionService {
  constructor(private readonly prisma: PrismaService) {}

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
    await this.ensureNotSuspended(workspaceId);
    const now = Date.now();
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, workspaceId },
      select: { customFields: true },
    });
    const cf = this.readRecord(contact?.customFields);
    const nextRetryAtValue = this.readOptionalText(cf.autopilotNextRetryAt);
    const nextRetryAt = nextRetryAtValue ? new Date(nextRetryAtValue).getTime() : 0;
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
    await this.prisma.contact.updateMany({
      where: { id: contactId, workspaceId },
      data: { customFields: { ...(cf || {}), autopilotNextRetryAt: null } },
    });
    return { queued: true, scheduled: false };
  }

  /** Marca conversão manual/webhook e registra evento CONVERSION. */
  async markConversion(input: {
    workspaceId: string;
    contactId?: string;
    phone?: string;
    reason?: string;
    meta?: Record<string, unknown>;
  }) {
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
            meta: { path: ['orderId'], equals: orderId as Prisma.InputJsonValue },
          },
          select: { id: true, contactId: true },
        });
        if (existing) return { ok: true, contactId: existing.contactId, deduped: true };
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
        meta: (meta || {}) as unknown as Prisma.InputJsonValue,
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

    return { ok: true, contactId: contactIdResolved };
  }
}
