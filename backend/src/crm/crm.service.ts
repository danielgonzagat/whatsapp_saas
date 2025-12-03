import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class CrmService {
  constructor(private prisma: PrismaService) {}

  // ============================================================
  // CONTATOS (CRM BÁSICO)
  // ============================================================

  async createContact(
    workspaceId: string,
    data: Prisma.ContactCreateWithoutWorkspaceInput,
  ) {
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

  async removeTag(workspaceId: string, phone: string, tagName: string) {
    const tag = await this.prisma.tag.findUnique({
      where: {
        workspaceId_name: {
          workspaceId,
          name: tagName,
        },
      },
    });

    if (!tag) return null;

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

  async listPipelines(workspaceId: string) {
    let pipelines = await this.prisma.pipeline.findMany({
      where: { workspaceId },
      include: { stages: { orderBy: { order: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });

    // Create default pipeline if none exists
    if (pipelines.length === 0) {
      await this.createPipeline(workspaceId, 'Pipeline de Vendas');
      pipelines = await this.prisma.pipeline.findMany({
        where: { workspaceId },
        include: { stages: { orderBy: { order: 'asc' } } },
        orderBy: { createdAt: 'asc' },
      });
    }

    return pipelines;
  }

  async createDeal(
    workspaceId: string,
    contactId: string,
    stageId: string,
    title: string,
    value: number,
  ) {
    const [contact, stage] = await Promise.all([
      this.prisma.contact.findUnique({
        where: { id: contactId },
        select: { id: true, workspaceId: true, customFields: true },
      }),
      this.prisma.stage.findUnique({
        where: { id: stageId },
        select: { id: true, pipeline: { select: { workspaceId: true } } },
      }),
    ]);

    if (!contact || !stage) {
      throw new NotFoundException('Contato ou etapa não encontrada');
    }
    if (
      contact.workspaceId !== workspaceId ||
      stage.pipeline.workspaceId !== workspaceId
    ) {
      throw new ForbiddenException(
        'Contato ou etapa não pertence a este workspace',
      );
    }

    const cf: any = contact.customFields || {};
    const sourceCampaignId = cf.lastCampaignId || undefined;

    return this.prisma.deal.create({
      data: {
        contact: { connect: { id: contact.id } },
        stage: { connect: { id: stage.id } },
        title,
        value,
        status: 'OPEN',
        ...(sourceCampaignId ? { sourceCampaignId } : {}),
      },
    });
  }

  async updateDeal(
    workspaceId: string,
    dealId: string,
    data: { title?: string; value?: number; status?: string },
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
    if (!deal) throw new NotFoundException('Deal não encontrado');
    if (deal.stage.pipeline.workspaceId !== workspaceId) {
      throw new ForbiddenException('Acesso negado a este deal');
    }

    const updated = await this.prisma.deal.update({
      where: { id: dealId },
      data,
    });

    // Atribuição de receita (Money Machine) quando status vira WON
    if (data.status === 'WON') {
      const cf: any = deal.contact?.customFields || {};
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
        await this.notifyRevenue(workspaceId, campaignId, deal.contactId, data.value ?? updated.value, 'DEAL_WON');
      }
    }

    return updated;
  }

  async deleteDeal(workspaceId: string, dealId: string) {
    const deal = await this.prisma.deal.findUnique({
      where: { id: dealId },
      select: {
        id: true,
        stage: { select: { pipeline: { select: { workspaceId: true } } } },
      },
    });
    if (!deal) throw new NotFoundException('Deal não encontrado');
    if (deal.stage.pipeline.workspaceId !== workspaceId) {
      throw new ForbiddenException('Acesso negado a este deal');
    }
    return this.prisma.deal.delete({ where: { id: dealId } });
  }

  async moveDeal(workspaceId: string, dealId: string, newStageId: string) {
    const [deal, stage] = await Promise.all([
      this.prisma.deal.findUnique({
        where: { id: dealId },
        include: {
          contact: { select: { id: true, workspaceId: true, customFields: true } },
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
      const cf: any = deal.contact?.customFields || {};
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
        await this.notifyRevenue(workspaceId, campaignId, deal.contact?.id, updatedDeal.value, 'DEAL_WON_STAGE');
      }
    }

    return updatedDeal;
  }

  async listDeals(workspaceId: string, campaignId?: string) {
    return this.prisma.deal.findMany({
      where: {
        stage: {
          pipeline: {
            workspaceId,
          },
        },
        ...(campaignId ? { sourceCampaignId: campaignId } : {}),
      },
      include: {
        contact: true,
        stage: {
          include: {
            pipeline: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
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
    const url =
      process.env.AUTOPILOT_ALERT_WEBHOOK ||
      process.env.OPS_WEBHOOK_URL ||
      '';
    if (!url || !(global as any).fetch) return;
    try {
      await (global as any).fetch(url, {
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
      });
    } catch (err: any) {
      // não interrompe fluxo se webhook falhar
    }
  }
}
