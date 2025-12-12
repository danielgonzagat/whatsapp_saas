import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateFollowUpDto {
  contactId: string;
  scheduledFor: Date | string;
  message?: string;
  reason?: string;
  flowId?: string;
}

export interface UpdateFollowUpDto {
  scheduledFor?: Date | string;
  message?: string;
  status?: 'pending' | 'sent' | 'cancelled';
  reason?: string;
}

@Injectable()
export class FollowUpService {
  private readonly logger = new Logger(FollowUpService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lista follow-ups de um workspace.
   */
  async list(workspaceId: string, status?: string) {
    const where: any = { workspaceId };
    if (status) {
      where.status = status;
    }

    return this.prisma.followUp.findMany({
      where,
      orderBy: { scheduledFor: 'asc' },
    });
  }

  /**
   * Cria um novo follow-up.
   */
  async create(workspaceId: string, dto: CreateFollowUpDto) {
    const scheduledFor =
      typeof dto.scheduledFor === 'string'
        ? new Date(dto.scheduledFor)
        : dto.scheduledFor;

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

    const data: any = {};
    if (dto.scheduledFor) {
      data.scheduledFor =
        typeof dto.scheduledFor === 'string'
          ? new Date(dto.scheduledFor)
          : dto.scheduledFor;
    }
    if (dto.message !== undefined) data.message = dto.message;
    if (dto.status) data.status = dto.status;
    if (dto.reason !== undefined) data.reason = dto.reason;

    return this.prisma.followUp.update({
      where: { id },
      data,
    });
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
      where: {
        status: 'pending',
        scheduledFor: { lte: new Date() },
      },
      orderBy: { scheduledFor: 'asc' },
      take: 100, // Processa em lotes
    });
  }

  /**
   * Marca follow-up como enviado.
   */
  async markSent(id: string) {
    return this.prisma.followUp.update({
      where: { id },
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
      this.prisma.followUp.count({ where: { workspaceId, status: 'cancelled' } }),
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
