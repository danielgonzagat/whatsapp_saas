import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PipelineService {
  constructor(private prisma: PrismaService) {}

  async getPipeline(workspaceId: string) {
    // Get default or first pipeline
    let pipeline = await this.prisma.pipeline.findFirst({
      where: { workspaceId },
      include: {
        stages: {
          include: { deals: { include: { contact: true } } },
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!pipeline) {
      // Create default pipeline
      pipeline = await this.prisma.pipeline.create({
        data: {
          name: 'Sales Pipeline',
          workspaceId,
          isDefault: true,
          stages: {
            create: [
              { name: 'Lead', color: '#E5E7EB', order: 0 },
              { name: 'Contacted', color: '#FEF3C7', order: 1 },
              { name: 'Proposal', color: '#DBEAFE', order: 2 },
              { name: 'Won', color: '#D1FAE5', order: 3 },
              { name: 'Lost', color: '#FEE2E2', order: 4 },
            ],
          },
        },
        include: {
          stages: {
            include: { deals: { include: { contact: true } } },
            orderBy: { order: 'asc' },
          },
        },
      });
    }

    return pipeline;
  }

  async updateDealStage(workspaceId: string, dealId: string, stageId: string) {
    const [deal, stage] = await Promise.all([
      this.prisma.deal.findUnique({
        where: { id: dealId },
        select: {
          id: true,
          contactId: true,
          contact: { select: { customFields: true } },
          stage: { select: { pipeline: { select: { workspaceId: true } } } },
        },
      }),
      this.prisma.stage.findUnique({
        where: { id: stageId },
        select: { id: true, name: true, pipeline: { select: { workspaceId: true } } },
      }),
    ]);

    if (!deal) throw new NotFoundException('Deal não encontrado');
    if (!stage) throw new NotFoundException('Etapa não encontrada');

    const dealWorkspace = deal.stage?.pipeline.workspaceId;
    const stageWorkspace = stage.pipeline.workspaceId;
    if (dealWorkspace !== workspaceId || stageWorkspace !== workspaceId) {
      throw new ForbiddenException('Acesso negado a este deal ou etapa');
    }

    const updated = await this.prisma.deal.update({
      where: { id: dealId },
      data: { stageId },
    });

    return updated;
  }

  async createDeal(workspaceId: string, data: any) {
    // Find first stage of default pipeline
    const pipeline = await this.getPipeline(workspaceId);
    const firstStage = pipeline.stages[0];

    if (data.contactId) {
      const contact = await this.prisma.contact.findUnique({
        where: { id: data.contactId },
        select: { workspaceId: true, customFields: true },
      });
      if (!contact || contact.workspaceId !== workspaceId) {
        throw new ForbiddenException('Contato não pertence a este workspace');
      }
      const cf: any = contact.customFields || {};
      const sourceCampaignId = cf.lastCampaignId || undefined;

      return this.prisma.deal.create({
        data: {
          title: data.title,
          value: data.value || 0,
          contactId: data.contactId,
          stageId: firstStage.id,
          ...(sourceCampaignId ? { sourceCampaignId } : {}),
        },
      });
    }

    return this.prisma.deal.create({
      data: {
        title: data.title,
        value: data.value || 0,
        contactId: data.contactId,
        stageId: firstStage.id,
      },
    });
  }
}
