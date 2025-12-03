import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MarketplaceService {
  private readonly logger = new Logger(MarketplaceService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listTemplates(category?: string) {
    return this.prisma.flowTemplate.findMany({
      where: { isPublic: true, ...(category ? { category } : {}) },
      orderBy: { downloads: 'desc' },
    });
  }

  async installTemplate(workspaceId: string, templateId: string) {
    const template = await this.prisma.flowTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      throw new Error('Template not found');
    }

    // Clone Flow
    const newFlow = await this.prisma.flow.create({
      data: {
        workspaceId,
        name: template.name,
        description: template.description,
        nodes: template.nodes,
        edges: template.edges,
        isActive: false,
        triggerType: 'MANUAL',
      },
    });

    // Increment downloads
    await this.prisma.flowTemplate.update({
      where: { id: templateId },
      data: { downloads: { increment: 1 } },
    });

    return newFlow;
  }
}
