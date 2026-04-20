import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DealStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { validateNoInternalAccess } from '../common/utils/url-validator';
import { PrismaService } from '../prisma/prisma.service';

/** Crm service. */
@Injectable()
export class CrmService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
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
    return this.prisma.contact.upsert({
      where: {
        workspaceId_phone: {
          workspaceId,
          phone,
        },
      },
      update: data as Prisma.ContactUpdateInput,
      create: {
        phone,
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
      include: { tags: true },
    });
  }

  /** Add tag. */
  async addTag(workspaceId: string, phone: string, tagName: string) {
    const tag = await this.prisma.tag.upsert({
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

    return this.prisma.contact.update({
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
      OR: search
        ? [
            { name: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search } },
            { email: { contains: search, mode: 'insensitive' } },
          ]
        : undefined,
    };

    const [total, data] = await Promise.all([
      this.prisma.contact.count({ where }),
      this.prisma.contact.findMany({
        where,
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
    return this.prisma.pipeline.create({
      data: {
        workspace: { connect: { id: workspaceId } },
        name,
        stages: {
          create: [
            { name: 'Lead', order: 0, color: '#3b82f6' },
            { name: 'Em Negociação', order: 1, color: '#facc15' },
            { name: 'Fechado', order: 2, color: '#22c55e' },
          ],
        },
      },
      include: { stages: true },
    });
  }

  /** List pipelines. */
  async listPipelines(workspaceId: string) {
    let pipelines = await this.prisma.pipeline.findMany({
      where: { workspaceId },
      include: { stages: { orderBy: { order: 'asc' }, take: 50 } },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });

    // Create default pipeline if none exists
    if (pipelines.length === 0) {
      await this.createPipeline(workspaceId, 'Pipeline de Vendas');
      pipelines = await this.prisma.pipeline.findMany({
        where: { workspaceId },
        include: { stages: { orderBy: { order: 'asc' }, take: 50 } },
        orderBy: { createdAt: 'asc' },
        take: 20,
      });
    }

    return pipelines;
  }

  /** Create deal. */
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
    const normalizedStageId = String(input.stageId || '').trim();
    if (!normalizedStageId) {
      throw new NotFoundException('Etapa não encontrada');
    }

    const stage = await this.prisma.stage.findUnique({
      where: { id: normalizedStageId },
      select: { id: true, pipeline: { select: { workspaceId: true } } },
    });

    if (!stage) {
      throw new NotFoundException('Etapa não encontrada');
    }
    if (stage.pipeline.workspaceId !== workspaceId) {
      throw new ForbiddenException('Etapa não pertence a este workspace');
    }

    let contact = input.contactId
      ? await this.prisma.contact.findUnique({
          where: { id: input.contactId },
          select: { id: true, workspaceId: true, customFields: true },
        })
      : null;

    if (!contact && input.contactPhone) {
      const normalizedPhone = String(input.contactPhone).trim();
      if (normalizedPhone) {
        contact = await this.prisma.contact.upsert({
          where: {
            workspaceId_phone: {
              workspaceId,
              phone: normalizedPhone,
            },
          },
          update: {
            ...(input.contactName
              ? { name: String(input.contactName).trim() || normalizedPhone }
              : {}),
          },
          create: {
            workspace: { connect: { id: workspaceId } },
            phone: normalizedPhone,
            name: String(input.contactName || normalizedPhone).trim(),
          },
          select: { id: true, workspaceId: true, customFields: true },
        });
      }
    }

    if (!contact) {
      throw new NotFoundException('Contato não encontrado');
    }
    if (contact.workspaceId !== workspaceId) {
      throw new ForbiddenException('Contato não pertence a este workspace');
    }

    const cf = (contact.customFields || {}) as Record<string, string>;
    const sourceCampaignId = cf.lastCampaignId || undefined;

    return this.prisma.deal.create({
      data: {
        contact: { connect: { id: contact.id } },
        stage: { connect: { id: stage.id } },
        title: input.title,
        value: input.value,
        status: 'OPEN',
        ...(sourceCampaignId ? { sourceCampaignId } : {}),
      },
    });
  }

  /** Update deal. */
  async updateDeal(
    workspaceId: string,
    dealId: string,
    data: { title?: string; value?: number; status?: DealStatus },
  ) {
    const deal = await this.prisma.deal.findUnique({
      where: { id: dealId },
      select: {
        id: true,
        contactId: true,
        contact: { select: { workspaceId: true, customFields: true } },
        stage: { select: { pipeline: { select: { workspaceId: true } } } },
      },
    });
    if (!deal) {
      throw new NotFoundException('Deal não encontrado');
    }
    if (deal.stage.pipeline.workspaceId !== workspaceId) {
      throw new ForbiddenException('Acesso negado a este deal');
    }

    const updated = await this.prisma.deal.update({
      where: { id: dealId },
      data,
    });

    // Atribuição de receita (Money Machine) quando status vira WON
    if (data.status === 'WON') {
      const cf = (deal.contact?.customFields || {}) as Record<string, string>;
      const campaignId = cf.lastCampaignId;
      if (campaignId) {
        await this.prisma.autopilotEvent.create({
          data: {
            workspaceId,
            action: 'DEAL_WON',
            intent: 'REVENUE',
            status: 'executed',
            contactId: deal.contactId,
            meta: {
              campaignId,
              dealId,
              value: data.value ?? updated.value,
              source: 'contact_lastCampaign',
            },
          },
        });
        await this.notifyRevenue(
          workspaceId,
          campaignId,
          deal.contactId,
          data.value ?? updated.value,
          'DEAL_WON',
        );
      }
    }

    return updated;
  }

  /** Delete deal. */
  async deleteDeal(workspaceId: string, dealId: string) {
    const deal = await this.prisma.deal.findUnique({
      where: { id: dealId },
      select: {
        id: true,
        stage: { select: { pipeline: { select: { workspaceId: true } } } },
      },
    });
    if (!deal) {
      throw new NotFoundException('Deal não encontrado');
    }
    if (deal.stage.pipeline.workspaceId !== workspaceId) {
      throw new ForbiddenException('Acesso negado a este deal');
    }
    await this.auditService.log({
      workspaceId,
      action: 'DELETE_RECORD',
      resource: 'Deal',
      resourceId: dealId,
      details: { deletedBy: 'user' },
    });
    return this.prisma.deal.delete({ where: { id: dealId } });
  }

  /** Move deal. */
  async moveDeal(workspaceId: string, dealId: string, newStageId: string) {
    const [deal, stage] = await Promise.all([
      this.prisma.deal.findUnique({
        where: { id: dealId },
        include: {
          contact: {
            select: { id: true, workspaceId: true, customFields: true },
          },
          stage: { include: { pipeline: { select: { workspaceId: true } } } },
        },
      }),
      this.prisma.stage.findUnique({
        where: { id: newStageId },
        select: { id: true, pipeline: { select: { workspaceId: true } } },
      }),
    ]);

    if (!deal || !stage) {
      throw new NotFoundException('Deal ou etapa não encontrada');
    }
    if (
      deal.contact?.workspaceId !== workspaceId ||
      deal.stage?.pipeline.workspaceId !== workspaceId ||
      stage.pipeline.workspaceId !== workspaceId
    ) {
      throw new ForbiddenException('Acesso negado a este deal ou etapa');
    }

    const updatedDeal = await this.prisma.deal.update({
      where: { id: dealId },
      data: { stageId: newStageId },
      include: {
        contact: true,
        stage: true,
      },
    });

    // Automação simples: ao ir para estágio "Fechado", marcar contato como cliente
    if (updatedDeal.stage?.name?.toLowerCase() === 'fechado') {
      const contact = updatedDeal.contact;
      if (contact) {
        await this.addTag(contact.workspaceId, contact.phone, 'cliente');
      }
    }

    const lower = (updatedDeal.stage?.name || '').toLowerCase();
    const isWon = lower.includes('won') || lower.includes('venda') || lower.includes('fechado');
    if (isWon) {
      const cf = (deal.contact?.customFields || {}) as Record<string, string>;
      const campaignId = cf.lastCampaignId;
      if (campaignId) {
        await this.prisma.autopilotEvent.create({
          data: {
            workspaceId,
            action: 'DEAL_WON_STAGE',
            intent: 'REVENUE',
            status: 'executed',
            contactId: deal.contact?.id,
            meta: {
              campaignId,
              dealId,
              value: updatedDeal.value,
              source: 'contact_lastCampaign',
            },
          },
        });
        await this.notifyRevenue(
          workspaceId,
          campaignId,
          deal.contact?.id,
          updatedDeal.value,
          'DEAL_WON_STAGE',
        );
      }
    }

    return updatedDeal;
  }

  /** List deals. */
  async listDeals(
    workspaceId: string,
    params?: {
      campaignId?: string;
      pipelineId?: string;
      stageId?: string;
      search?: string;
    },
  ) {
    const campaignId = params?.campaignId;
    const pipelineId = String(params?.pipelineId || '').trim();
    const stageId = String(params?.stageId || '').trim();
    const search = String(params?.search || '').trim();

    return this.prisma.deal.findMany({
      where: {
        stage: {
          pipeline: {
            workspaceId,
            ...(pipelineId ? { id: pipelineId } : {}),
          },
        },
        ...(stageId ? { stageId } : {}),
        ...(campaignId ? { sourceCampaignId: campaignId } : {}),
        ...(search
          ? {
              OR: [
                { title: { contains: search, mode: 'insensitive' } },
                {
                  contact: {
                    is: {
                      OR: [
                        { name: { contains: search, mode: 'insensitive' } },
                        { phone: { contains: search } },
                        { email: { contains: search, mode: 'insensitive' } },
                      ],
                    },
                  },
                },
              ],
            }
          : {}),
      },
      include: {
        contact: { select: { id: true, name: true, phone: true, email: true } },
        stage: {
          select: {
            id: true,
            name: true,
            order: true,
            pipeline: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  /**
   * Notifica webhook de receita atrelada a campanha (se configurado).
   */
  private async notifyRevenue(
    workspaceId: string,
    campaignId: string,
    contactId: string | undefined,
    value: number,
    source: string,
  ) {
    const url = process.env.AUTOPILOT_ALERT_WEBHOOK || process.env.OPS_WEBHOOK_URL || '';
    if (!url || !globalThis.fetch) {
      return;
    }
    try {
      validateNoInternalAccess(url);
      await globalThis.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'revenue_event',
          workspaceId,
          campaignId,
          contactId,
          value,
          source,
          at: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      // PULSE:OK — CRM webhook notification non-critical; contact event still recorded
    }
  }
}
