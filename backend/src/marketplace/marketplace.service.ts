import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

function requireTemplateJson(value: Prisma.JsonValue, field: string): Prisma.InputJsonValue {
  if (value === null) {
    throw new Error(`Template ${field} is missing`);
  }
  return value;
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

  /** List marketplace products. */
  async list(
    workspaceId: string,
    filter?: { category?: string; search?: string; limit?: number },
  ): Promise<{
    items: Array<{
      id: string;
      name: string;
      description: string;
      price: bigint;
      vendor: string;
    }>;
    total: number;
  }> {
    const where: Prisma.ProductWhereInput = {
      workspaceId,
      active: true,
      ...(filter?.category ? { category: filter.category } : {}),
      ...(filter?.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' } },
              { description: { contains: filter.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const limit = filter?.limit ?? 20;

    const [total, products] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      items: products.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description ?? '',
        price: BigInt(Math.round(p.price * 100)),
        vendor: p.workspaceId,
      })),
      total,
    };
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
