import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

function requireTemplateJson(value: Prisma.JsonValue, field: string): Prisma.InputJsonValue {
  if (value === null) {
    throw new Error(`Template ${field} is missing`);
  }
  return value as Prisma.InputJsonValue;
}

/** Marketplace service. */
@Injectable()
export class MarketplaceService {
  private readonly logger = new Logger(MarketplaceService.name);

  constructor(private readonly prisma: PrismaService) {
    this.logger.log('MarketplaceService initialized');
  }

  /** List templates. */
  async listTemplates(category?: string) {
    return this.prisma.flowTemplate.findMany({
      where: { isPublic: true, ...(category ? { category } : {}) },
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        downloads: true,
        isPublic: true,
        nodes: true,
        edges: true,
        createdAt: true,
      },
      orderBy: { downloads: 'desc' },
      take: 100,
    });
  }

  /** Install template. */
  async installTemplate(workspaceId: string, templateId: string) {
    const template = await this.prisma.flowTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      throw new Error('Template not found');
    }

    const nodes = requireTemplateJson(template.nodes, 'nodes');
    const edges = requireTemplateJson(template.edges, 'edges');
    const newFlow = await this.prisma.flow.create({
      data: {
        workspace: { connect: { id: workspaceId } },
        name: template.name,
        description: template.description,
        nodes,
        edges,
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
