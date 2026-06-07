import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { DealStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePhone } from '../common/phone/phone-normalization.util';
import { CrmEventEmitterService } from '../kloel/crm-emitter/crm-event-emitter.service';
import {
  createPipeline as createPipelineHelper,
  listPipelines as listPipelinesHelper,
  createDeal as createDealHelper,
  updateDeal as updateDealHelper,
  deleteDeal as deleteDealHelper,
  moveDeal as moveDealHelper,
  listDeals as listDealsHelper,
} from './crm.deals.helpers';
/** Crm service. */
@Injectable()
export class CrmService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    @Optional() private readonly crmEmitter?: CrmEventEmitterService,
  ) {}
  // ============================================================
  // CONTATOS (CRM BÁSICO)
  // ============================================================
  async createContact(workspaceId: string, data: Prisma.ContactCreateWithoutWorkspaceInput) {
    return this.prisma.contact.create({
      data: {
        ...data,
        workspace: {
          connect: { id: workspaceId },
        },
      },
      include: { tags: true },
    });
  }
  /** Upsert contact. */
  async upsertContact(
    workspaceId: string,
    phone: string,
    data: Partial<Prisma.ContactCreateWithoutWorkspaceInput>,
  ) {
    // Canonicalize phone identity so every contact write converges on the same
    // workspaceId_phone key (E.164 digits, BR-promoted). Idempotent. Falls back
    // to the original phone when the input cannot be canonicalized.
    const canonicalPhone = normalizePhone(phone)?.digits ?? phone;
    return this.prisma.contact.upsert({
      where: {
        workspaceId_phone: {
          workspaceId,
          phone: canonicalPhone,
        },
      },
      update: data,
      create: {
        phone: canonicalPhone,
        ...data,
        workspace: {
          connect: { id: workspaceId },
        },
      },
      include: { tags: true },
    });
  }
  /** Get contact. */
  async getContact(workspaceId: string, phone: string) {
    return this.prisma.contact.findUnique({
      where: {
        workspaceId_phone: {
          workspaceId,
          phone,
        },
      },
      include: {
        tags: true,
        deals: {
          include: { stage: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });
  }
  /** Add tag. */
  async addTag(workspaceId: string, phone: string, tagName: string) {
    return this.prisma.$transaction(async (tx) => {
      const tag = await tx.tag.upsert({
        where: {
          workspaceId_name: {
            workspaceId,
            name: tagName,
          },
        },
        update: {},
        create: {
          name: tagName,
          workspace: { connect: { id: workspaceId } },
        },
      });
      return tx.contact.update({
        where: {
          workspaceId_phone: {
            workspaceId,
            phone,
          },
        },
        data: {
          tags: {
            connect: { id: tag.id },
          },
        },
        include: { tags: true },
      });
    });
  }
  /** Remove tag. */
  async removeTag(workspaceId: string, phone: string, tagName: string) {
    const tag = await this.prisma.tag.findUnique({
      where: {
        workspaceId_name: {
          workspaceId,
          name: tagName,
        },
      },
    });
    if (!tag) {
      return null;
    }
    return this.prisma.contact.update({
      where: {
        workspaceId_phone: {
          workspaceId,
          phone,
        },
      },
      data: {
        tags: {
          disconnect: { id: tag.id },
        },
      },
      include: { tags: true },
    });
  }
  /** List contacts. */
  async listContacts(
    workspaceId: string,
    params: { page?: number; limit?: number; search?: string },
  ) {
    const { page = 1, limit = 20, search } = params;
    const skip = (page - 1) * limit;
    const where: Prisma.ContactWhereInput = {
      workspaceId,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, data] = await Promise.all([
      this.prisma.contact.count({ where: { ...where, workspaceId } }),
      this.prisma.contact.findMany({
        where: { ...where, workspaceId },
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: { tags: true },
      }),
    ]);
    return {
      data,
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }
  // ============================================================
  // PIPELINES / DEALS (KANBAN DE VENDAS)
  // ============================================================
  async createPipeline(workspaceId: string, name: string) {
    return createPipelineHelper(this.prisma, workspaceId, name);
  }

  async listPipelines(workspaceId: string) {
    return listPipelinesHelper(this.prisma, workspaceId);
  }

  async createDeal(
    workspaceId: string,
    input: {
      contactId?: string;
      contactPhone?: string;
      contactName?: string;
      stageId?: string;
      title: string;
      value: number;
    },
  ) {
    return createDealHelper(this.prisma, workspaceId, input);
  }

  async updateDeal(
    workspaceId: string,
    dealId: string,
    data: { title?: string; value?: number; status?: DealStatus },
  ) {
    return updateDealHelper(this.prisma, workspaceId, dealId, data, this.crmEmitter);
  }

  async deleteDeal(workspaceId: string, dealId: string) {
    return deleteDealHelper(this.prisma, workspaceId, dealId, this.auditService);
  }

  async moveDeal(workspaceId: string, dealId: string, newStageId: string) {
    // Census P2-13: thread the canonical addTag surface as the optional
    // tag-write callback. moveDealHelper only invokes it when KLOEL_TAG_VIA_CRM
    // is ON; default OFF keeps the legacy inline tag transaction (byte-identical).
    return moveDealHelper(
      this.prisma,
      workspaceId,
      dealId,
      newStageId,
      this.crmEmitter,
      (ws, phone, tagName) => this.addTag(ws, phone, tagName),
    );
  }

  async listDeals(
    workspaceId: string,
    params?: {
      campaignId?: string;
      pipelineId?: string;
      stageId?: string;
      search?: string;
    },
  ) {
    return listDealsHelper(this.prisma, workspaceId, params);
  }

  /** Get pipeline with stages, deals and total value. */
  async getPipeline(workspaceId: string): Promise<{
    stages: Array<{
      id: string;
      name: string;
      leads: Array<{
        id: string;
        name: string;
        value: bigint;
        lastActivity: Date;
      }>;
    }>;
    totalValue: bigint;
  }> {
    const pipeline = await this.prisma.pipeline.findFirst({
      where: { workspaceId },
      include: {
        stages: {
          orderBy: { order: 'asc' },
          include: {
            deals: {
              orderBy: { updatedAt: 'desc' },
            },
          },
        },
      },
    });

    if (!pipeline) {
      throw new NotFoundException('Pipeline não encontrado');
    }

    let totalValue = 0n;
    const stages = pipeline.stages.map((stage) => {
      const leads = stage.deals.map((deal) => {
        const value = BigInt(Math.round(deal.value * 100));
        totalValue += value;
        return {
          id: deal.id,
          name: deal.title,
          value,
          lastActivity: deal.updatedAt,
        };
      });
      return {
        id: stage.id,
        name: stage.name,
        leads,
      };
    });

    return { stages, totalValue };
  }

  /**
   * Canonical-name management method for the Kloel capability resolver
   * (`CrmService.moveLead`). Accepts the (workspaceId, args) signature used
   * by `KloelDomainServiceResolver`.
   *
   * Moves a lead/deal to another pipeline stage. The target stage may be
   * given directly via `args.stageId`, or resolved by `args.stage` (stage
   * name, case-insensitive) within the workspace's pipeline. Mutation is
   * delegated to {@link moveDeal} — no new persistence logic introduced and
   * cross-workspace access is rejected there.
   */
  async moveLead(
    workspaceId: string,
    args?: { leadId?: string; dealId?: string; stageId?: string; stage?: string },
  ): Promise<{ success: true; dealId: string; stageId: string }> {
    const dealId =
      typeof args?.dealId === 'string' && args.dealId
        ? args.dealId
        : typeof args?.leadId === 'string'
          ? args.leadId
          : '';
    if (!dealId) {
      throw new NotFoundException('CrmService.moveLead: informe leadId ou dealId.');
    }

    let stageId = typeof args?.stageId === 'string' ? args.stageId : '';
    if (!stageId) {
      const stageName = typeof args?.stage === 'string' ? args.stage.trim() : '';
      if (!stageName) {
        throw new NotFoundException('CrmService.moveLead: informe stageId ou stage (nome).');
      }
      const stage = await this.prisma.stage.findFirst({
        where: {
          name: { equals: stageName, mode: 'insensitive' },
          pipeline: { workspaceId },
        },
        select: { id: true },
      });
      if (!stage) {
        throw new NotFoundException(`Etapa "${stageName}" não encontrada neste workspace.`);
      }
      stageId = stage.id;
    }

    const updated = await this.moveDeal(workspaceId, dealId, stageId);
    return { success: true, dealId: updated.id, stageId };
  }

  /**
   * Canonical-name management method for the Kloel capability resolver
   * (`CrmService.openSupportTicket`). Accepts the (workspaceId, args)
   * signature used by `KloelDomainServiceResolver`.
   *
   * Opens a support ticket as a workspace-scoped Conversation (the canonical
   * ticket entity in this codebase — see AdminSupportService). The contact is
   * resolved/upserted from `args.contactPhone`; no contact is fabricated. The
   * opening note is persisted as an OUTBOUND NOTE message and audited.
   */
  async openSupportTicket(
    workspaceId: string,
    args?: {
      contactPhone?: string;
      subject?: string;
      message?: string;
      priority?: string;
    },
  ): Promise<{ success: true; ticketId: string }> {
    const phone = typeof args?.contactPhone === 'string' ? args.contactPhone.trim() : '';
    const subject = typeof args?.subject === 'string' ? args.subject.trim() : '';
    if (!phone) {
      throw new NotFoundException('CrmService.openSupportTicket: contactPhone é obrigatório.');
    }
    if (!subject) {
      throw new NotFoundException('CrmService.openSupportTicket: subject é obrigatório.');
    }
    const priority = ['LOW', 'MEDIUM', 'HIGH'].includes(String(args?.priority).toUpperCase())
      ? String(args?.priority).toUpperCase()
      : 'MEDIUM';
    const body = typeof args?.message === 'string' ? args.message.trim() : '';

    const ticketId = await this.prisma.$transaction(async (tx) => {
      const contact = await tx.contact.upsert({
        where: { workspaceId_phone: { workspaceId, phone } },
        update: {},
        create: { phone, workspace: { connect: { id: workspaceId } } },
        select: { id: true },
      });

      const conversation = await tx.conversation.create({
        data: {
          workspaceId,
          contactId: contact.id,
          status: 'OPEN',
          priority,
          channel: 'WEB',
          mode: 'HUMAN',
        },
        select: { id: true },
      });

      await tx.message.create({
        data: {
          conversationId: conversation.id,
          workspaceId,
          contactId: contact.id,
          direction: 'OUTBOUND',
          type: 'NOTE',
          status: 'SENT',
          content: body ? `${subject}\n\n${body}` : subject,
        },
      });

      return conversation.id;
    });

    await this.auditService
      .log({
        workspaceId,
        action: 'crm.support_ticket_opened',
        resource: 'Conversation',
        resourceId: ticketId,
        details: { subject, priority },
      })
      .catch(() => undefined);

    return { success: true, ticketId };
  }

  /**
   * Canonical-name management method for the Kloel capability resolver
   * (`CrmService.listSupportTickets`). Accepts the (workspaceId, args)
   * signature used by `KloelDomainServiceResolver`. Read-only, workspace-scoped
   * list of support Conversations (most-recent first, capped at 50).
   */
  async listSupportTickets(
    workspaceId: string,
    args?: { status?: string; limit?: number },
  ): Promise<{
    items: Array<{
      ticketId: string;
      status: string;
      priority: string;
      channel: string;
      lastMessageAt: string;
      createdAt: string;
    }>;
    total: number;
  }> {
    const status = typeof args?.status === 'string' ? args.status.toUpperCase() : undefined;
    const limit = Math.min(Math.max(Math.trunc(args?.limit ?? 50), 1), 50);

    const rows = await this.prisma.conversation.findMany({
      where: { workspaceId, ...(status ? { status } : {}) },
      orderBy: { lastMessageAt: 'desc' },
      take: limit,
      select: {
        id: true,
        status: true,
        priority: true,
        channel: true,
        lastMessageAt: true,
        createdAt: true,
      },
    });

    return {
      items: rows.map((r) => ({
        ticketId: r.id,
        status: r.status,
        priority: r.priority,
        channel: r.channel,
        lastMessageAt: r.lastMessageAt.toISOString(),
        createdAt: r.createdAt.toISOString(),
      })),
      total: rows.length,
    };
  }
}
