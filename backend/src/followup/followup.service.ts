import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { forEachSequential } from '../common/async-sequence';
import { PrismaService } from '../prisma/prisma.service';
import { buildQueueJobId } from '../queue/job-id.util';
import { autopilotQueue } from '../queue/queue';

/** Create follow up dto shape. */
export interface CreateFollowUpDto {
  /** Contact id property. */
  contactId: string;
  /** Scheduled for property. */
  scheduledFor: Date | string;
  /** Message property. */
  message?: string;
  /** Reason property. */
  reason?: string;
  /** Flow id property. */
  flowId?: string;
}

/** Update follow up dto shape. */
export interface UpdateFollowUpDto {
  /** Scheduled for property. */
  scheduledFor?: Date | string;
  /** Message property. */
  message?: string;
  /** Status property. */
  status?: 'pending' | 'sent' | 'cancelled';
  /** Reason property. */
  reason?: string;
}

/** Follow up service. */
// PULSE_OK: new Date(dto.scheduledFor) validated with type check + isNaN(getTime()) + BadRequestException in create() and update()
@Injectable()
export class FollowUpService {
  private readonly logger = new Logger(FollowUpService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Process due follow ups. */
  @Cron(CronExpression.EVERY_MINUTE)
  async processDueFollowUps() {
    const due = await this.findDue().catch(() => []);
    if (!due.length) {
      return;
    }

    // Batch-fetch contacts for all due follow-ups, keyed by workspace so we
    // can never serve a contact from a different tenant even if two tenants
    // accidentally share a contact id.
    const contactLookups = due
      .filter((f) => Boolean(f.contactId))
      .map((f) => ({ id: f.contactId, workspaceId: f.workspaceId }));
    const contactsList = contactLookups.length
      ? await this.prisma.contact.findMany({
          take: 5000,
          where: { OR: contactLookups },
          select: { id: true, phone: true, name: true, workspaceId: true },
        })
      : [];
    const contactsMap = new Map(contactsList.map((c) => [`${c.workspaceId}:${c.id}`, c]));

    await forEachSequential(due, async (followUp) => {
      try {
        const contact = contactsMap.get(`${followUp.workspaceId}:${followUp.contactId}`) ?? null;

        if (!contact?.phone) {
          await this.update(followUp.workspaceId, followUp.id, {
            status: 'cancelled',
            reason: 'contact_phone_missing',
          });
          return;
        }

        await autopilotQueue.add(
          'followup-contact',
          {
            workspaceId: followUp.workspaceId,
            contactId: followUp.contactId,
            phone: contact.phone,
            contactName: contact.name || undefined,
            messageContent: followUp.message || undefined,
            reason: followUp.reason || 'scheduled_followup',
            scheduledAt: followUp.scheduledFor.toISOString(),
            followUpId: followUp.id,
          },
          {
            jobId: buildQueueJobId('scheduled-followup', followUp.workspaceId, followUp.id),
            removeOnComplete: true,
          },
        );

        await this.markSent(followUp.workspaceId, followUp.id);
      } catch (error: unknown) {
        this.logger.warn(
          `Failed to dispatch follow-up ${followUp.id}: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    });
  }

  /**
   * Lista follow-ups de um workspace.
   */
  async list(workspaceId: string, status?: string) {
    const where: { workspaceId: string; status?: string } = { workspaceId };
    if (status) {
      where.status = status;
    }

    return this.prisma.followUp.findMany({
      where,
      select: {
        id: true,
        workspaceId: true,
        contactId: true,
        scheduledFor: true,
        message: true,
        status: true,
        reason: true,
        flowId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { scheduledFor: 'asc' },
      take: 100,
    });
  }

  /**
   * Cria um novo follow-up.
   */
  async create(workspaceId: string, dto: CreateFollowUpDto) {
    const scheduledFor =
      typeof dto.scheduledFor === 'string' ? new Date(dto.scheduledFor) : dto.scheduledFor;
    if (Number.isNaN(scheduledFor.getTime())) {
      throw new BadRequestException('Invalid scheduledFor');
    }

    const contact = await this.prisma.contact.findFirst({
      where: { id: dto.contactId, workspaceId },
      select: { id: true },
    });
    if (!contact) {
      throw new NotFoundException('Contato não encontrado no workspace');
    }

    return this.prisma.followUp.create({
      data: {
        workspaceId,
        contactId: dto.contactId,
        scheduledFor,
        message: dto.message,
        reason: dto.reason,
        flowId: dto.flowId,
        status: 'pending',
      },
    });
  }

  /**
   * Atualiza um follow-up existente.
   */
  async update(workspaceId: string, id: string, dto: UpdateFollowUpDto) {
    const existing = await this.prisma.followUp.findFirst({
      where: { id, workspaceId },
    });

    if (!existing) {
      throw new NotFoundException('Follow-up não encontrado');
    }

    const data: { scheduledFor?: Date; message?: string; status?: string; reason?: string } = {};
    if (dto.scheduledFor) {
      data.scheduledFor =
        typeof dto.scheduledFor === 'string' ? new Date(dto.scheduledFor) : dto.scheduledFor;
      if (Number.isNaN(data.scheduledFor.getTime())) {
        throw new BadRequestException('Invalid scheduledFor');
      }
    }
    if (dto.message !== undefined) {
      data.message = dto.message;
    }
    if (dto.status) {
      data.status = dto.status;
    }
    if (dto.reason !== undefined) {
      data.reason = dto.reason;
    }

    await this.prisma.followUp.updateMany({
      where: { id, workspaceId },
      data,
    });
    return { ...existing, ...data };
  }

  /**
   * Cancela um follow-up.
   */
  async cancel(workspaceId: string, id: string) {
    return this.update(workspaceId, id, { status: 'cancelled' });
  }

  /**
   * Busca follow-ups que estão vencidos (scheduledFor <= now e status = pending).
   */
  async findDue() {
    return this.prisma.followUp.findMany({
      take: 100, // Processa em lotes
      where: {
        status: 'pending',
        scheduledFor: { lte: new Date() },
      },
      select: {
        id: true,
        workspaceId: true,
        contactId: true,
        scheduledFor: true,
        status: true,
        message: true,
      },
      orderBy: { scheduledFor: 'asc' },
    });
  }

  /**
   * Marca follow-up como enviado. Requires workspaceId so the multi-tenant
   * guard can validate the row belongs to the caller.
   */
  async markSent(workspaceId: string, id: string) {
    await this.prisma.followUp.updateMany({
      where: { id, workspaceId },
      data: {
        status: 'sent',
        sentAt: new Date(),
      },
    });
  }

  /**
   * Estatísticas de follow-ups por workspace.
   */
  async getStats(workspaceId: string) {
    const [pending, sent, cancelled] = await Promise.all([
      this.prisma.followUp.count({ where: { workspaceId, status: 'pending' } }),
      this.prisma.followUp.count({ where: { workspaceId, status: 'sent' } }),
      this.prisma.followUp.count({
        where: { workspaceId, status: 'cancelled' },
      }),
    ]);

    const nextUp = await this.prisma.followUp.findFirst({
      where: { workspaceId, status: 'pending' },
      orderBy: { scheduledFor: 'asc' },
      select: { scheduledFor: true, contactId: true },
    });

    return {
      pending,
      sent,
      cancelled,
      total: pending + sent + cancelled,
      nextUp,
    };
  }
}
