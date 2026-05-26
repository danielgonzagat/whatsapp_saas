import { ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import { DealStatus } from '@prisma/client';
import { getTraceHeaders } from '../common/trace-headers';
import { validateNoInternalAccess } from '../common/utils/url-validator';
import { PIPELINE_STAGE_COLORS } from '../common/kloel-colors';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { CrmEventEmitterService } from '../kloel/crm-emitter/crm-event-emitter.service';
const logger = new Logger('CrmDealsHelpers');
/** Create pipeline with default stages. */
export async function createPipeline(prisma: PrismaService, workspaceId: string, name: string) {
  return prisma.pipeline.create({
    data: {
      workspace: { connect: { id: workspaceId } },
      name,
      stages: {
        create: [
          { name: 'Lead', order: 0, color: PIPELINE_STAGE_COLORS.LEAD_BLUE },
          { name: 'Em Negociação', order: 1, color: PIPELINE_STAGE_COLORS.NEGOTIATION_YELLOW },
          { name: 'Fechado', order: 2, color: PIPELINE_STAGE_COLORS.WON_GREEN },
        ],
      },
    },
    include: { stages: true },
  });
}
/** List pipelines. Creates default pipeline if none exist. */
export async function listPipelines(prisma: PrismaService, workspaceId: string) {
  let pipelines = await prisma.pipeline.findMany({
    where: { workspaceId },
    include: { stages: { orderBy: { order: 'asc' }, take: 50 } },
    orderBy: { createdAt: 'asc' },
    take: 20,
  });
  if (pipelines.length === 0) {
    await createPipeline(prisma, workspaceId, 'Pipeline de Vendas');
    pipelines = await prisma.pipeline.findMany({
      where: { workspaceId },
      include: { stages: { orderBy: { order: 'asc' }, take: 50 } },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
  }
  return pipelines;
}
/** Create deal. */
export async function createDeal(
  prisma: PrismaService,
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
  const stage = await prisma.stage.findUnique({
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
    ? await prisma.contact.findUnique({
        where: { id: input.contactId },
        select: { id: true, workspaceId: true, customFields: true },
      })
    : null;
  if (!contact && input.contactPhone) {
    const normalizedPhone = String(input.contactPhone).trim();
    if (normalizedPhone) {
      contact = await prisma.contact.upsert({
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
  return prisma.deal.create({
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
/** Notify revenue webhook (internal helper). */
export async function notifyRevenue(
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
    logger.log('Sending revenue webhook notification', {
      context: 'CrmDealsHelpers.notifyRevenue',
      workspaceId,
      campaignId,
      source,
    });
    validateNoInternalAccess(url);
    await globalThis.fetch(url, {
      method: 'POST',
      headers: { ...getTraceHeaders(), 'Content-Type': 'application/json' },
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
  } catch (error: unknown) {
    logger.error(
      'Failed to send revenue webhook notification',
      error instanceof Error ? error.message : String(error),
      { context: 'CrmDealsHelpers.notifyRevenue', workspaceId, campaignId },
    );
  }
}
/** Update deal. */
export async function updateDeal(
  prisma: PrismaService,
  workspaceId: string,
  dealId: string,
  data: { title?: string; value?: number; status?: DealStatus },
  crmEmitter?: CrmEventEmitterService,
) {
  const deal = await prisma.deal.findUnique({
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
  const updated = await prisma.deal.update({
    where: { id: dealId },
    data,
  });
  if (data.status === 'WON') {
    void crmEmitter
      ?.emitDealWon(workspaceId, dealId, data.value ?? updated.value, deal.contactId)
      .catch(() => {});
  } else if (data.status === 'LOST') {
    void crmEmitter?.emitDealLost(workspaceId, dealId, undefined, deal.contactId).catch(() => {});
  }
  if (data.status === 'WON') {
    const cf = (deal.contact?.customFields || {}) as Record<string, string>;
    const campaignId = cf.lastCampaignId;
    if (campaignId) {
      await prisma.autopilotEvent.create({
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
      await notifyRevenue(
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
export async function deleteDeal(
  prisma: PrismaService,
  workspaceId: string,
  dealId: string,
  auditService: AuditService,
) {
  const deal = await prisma.deal.findUnique({
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
  await auditService.log({
    workspaceId,
    action: 'DELETE_RECORD',
    resource: 'Deal',
    resourceId: dealId,
    details: { deletedBy: 'user' },
  });
  return prisma.deal.delete({ where: { id: dealId } });
}
/** Add a tag to a contact (inline helper for moveDeal). */
async function addTagInline(
  prisma: PrismaService,
  workspaceId: string,
  phone: string,
  tagName: string,
) {
  await prisma.$transaction(async (tx) => {
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
    await tx.contact.update({
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
    });
  });
}
/** Move deal to a new stage. */
export async function moveDeal(
  prisma: PrismaService,
  workspaceId: string,
  dealId: string,
  newStageId: string,
  crmEmitter?: CrmEventEmitterService,
) {
  const [deal, stage] = await Promise.all([
    prisma.deal.findUnique({
      where: { id: dealId },
      include: {
        contact: {
          select: { id: true, workspaceId: true, customFields: true, phone: true },
        },
        stage: { include: { pipeline: { select: { workspaceId: true } } } },
      },
    }),
    prisma.stage.findUnique({
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
  const updatedDeal = await prisma.deal.update({
    where: { id: dealId },
    data: { stageId: newStageId },
    include: {
      contact: true,
      stage: true,
    },
  });
  if (updatedDeal.stage?.name?.toLowerCase() === 'fechado') {
    const contact = updatedDeal.contact;
    if (contact) {
      await addTagInline(prisma, contact.workspaceId, contact.phone, 'cliente');
    }
  }
  const fromStageName = deal.stage?.name ?? 'unknown';
  const toStageName = updatedDeal.stage?.name ?? 'unknown';
  void crmEmitter
    ?.emitStageChanged(workspaceId, dealId, fromStageName, toStageName, deal.contact?.id)
    .catch(() => {});
  const lower = (updatedDeal.stage?.name || '').toLowerCase();
  const isWon = lower.includes('won') || lower.includes('venda') || lower.includes('fechado');
  const isLost = lower.includes('lost') || lower.includes('perdido');
  if (isWon || isLost) {
    if (isWon) {
      void crmEmitter
        ?.emitDealWon(workspaceId, dealId, updatedDeal.value, deal.contact?.id)
        .catch(() => {});
    } else {
      void crmEmitter
        ?.emitDealLost(workspaceId, dealId, toStageName, deal.contact?.id)
        .catch(() => {});
    }
  }
  if (isWon) {
    const cf = (deal.contact?.customFields || {}) as Record<string, string>;
    const campaignId = cf.lastCampaignId;
    if (campaignId) {
      await prisma.autopilotEvent.create({
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
      await notifyRevenue(
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
export async function listDeals(
  prisma: PrismaService,
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
  return prisma.deal.findMany({
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
