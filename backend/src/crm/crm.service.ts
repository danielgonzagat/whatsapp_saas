import { Injectable, Optional } from '@nestjs/common';
import { DealStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
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
    return this.prisma.contact.upsert({
      where: {
        workspaceId_phone: {
          workspaceId,
          phone,
        },
      },
      update: data,
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
    return moveDealHelper(this.prisma, workspaceId, dealId, newStageId, this.crmEmitter);
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
}
