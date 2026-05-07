import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { forEachSequential } from '../common/async-sequence';
import { PrismaService } from '../prisma/prisma.service';
import {
  getRecommendedFlowTemplates,
  type RecommendedFlowTemplate,
} from './flow-template.recommended';

type CreateFlowTemplateInput = RecommendedFlowTemplate;

/** Flow template service. */
@Injectable()
export class FlowTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retorna um conjunto de templates recomendados para uso inicial.
   */
  getRecommendedTemplates(): CreateFlowTemplateInput[] {
    return getRecommendedFlowTemplates();
  }

  /** Create. */
  async create(input: CreateFlowTemplateInput) {
    return this.prisma.flowTemplate.create({
      data: {
        name: input.name,
        category: input.category,
        nodes: input.nodes as Prisma.InputJsonValue,
        edges: input.edges as Prisma.InputJsonValue,
        description: input.description,
        isPublic: input.isPublic ?? false,
      },
    });
  }

  /** List public. */
  async listPublic() {
    return this.prisma.flowTemplate.findMany({
      take: 100,
      where: { isPublic: true },
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        downloads: true,
        isPublic: true,
        createdAt: true,
      },
      orderBy: { downloads: 'desc' },
    });
  }

  /** List all. */
  async listAll() {
    return this.prisma.flowTemplate.findMany({
      take: 200,
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        downloads: true,
        isPublic: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /** Get. */
  async get(id: string) {
    const tpl = await this.prisma.flowTemplate.findUnique({
      where: { id },
    });
    if (!tpl) {
      throw new NotFoundException('Template não encontrado');
    }
    return tpl;
  }

  /** Increment download. */
  async incrementDownload(id: string) {
    const tpl = await this.prisma.flowTemplate.update({
      where: { id },
      data: { downloads: { increment: 1 } },
    });
    return tpl;
  }

  /**
   * Semear templates recomendados sem duplicar pelo nome.
   */
  async seedRecommended() {
    const templates = this.getRecommendedTemplates();
    const templateNames = templates.map((t) => t.name);

    // Batch-fetch existing templates to avoid N+1
    const existingTemplates = await this.prisma.flowTemplate.findMany({
      take: 1000,
      where: { name: { in: templateNames } },
      select: {
        id: true,
        name: true,
        nodes: true,
        edges: true,
        description: true,
        category: true,
        isPublic: true,
        downloads: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    const existingByName = new Map(existingTemplates.map((t) => [t.name, t]));

    const created: unknown[] = [];
    await forEachSequential(templates, async (tpl) => {
      const existing = existingByName.get(tpl.name);
      if (existing) {
        created.push(existing);
        return;
      }
      const inserted = await this.create(tpl);
      created.push(inserted);
    });
    return { seeded: created.length, templates: created };
  }
}
