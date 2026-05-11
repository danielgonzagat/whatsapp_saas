import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Marketplace service. */
@Injectable()
export class MarketplaceService {
  constructor(private readonly prisma: PrismaService) {}

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

    // Clone Flow
    const newFlow = await this.prisma.flow.create({
      data: {
        workspaceId,
        name: template.name,
        description: template.description,
        nodes: template.nodes ?? Prisma.JsonNull,
        edges: template.edges ?? Prisma.JsonNull,
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
