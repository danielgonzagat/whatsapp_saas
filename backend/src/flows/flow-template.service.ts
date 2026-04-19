import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { forEachSequential } from '../common/async-sequence';
import { PrismaService } from '../prisma/prisma.service';

type CreateFlowTemplateInput = {
  name: string;
  category: string;
  nodes: unknown;
  edges: unknown;
  description?: string;
  isPublic?: boolean;
};

@Injectable()
export class FlowTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retorna um conjunto de templates recomendados para uso inicial.
   */
  getRecommendedTemplates(): CreateFlowTemplateInput[] {
    return [
      {
        name: 'WhatsApp - Qualificação Rápida',
        category: 'SALES',
        description:
          'Fluxo curto para capturar nome, necessidade e orçamento antes de passar para humano.',
        nodes: [
          { id: 'start', type: 'start', label: 'Início' },
          {
            id: 'ask_name',
            type: 'message',
            label: 'Pergunta nome',
            content: 'Oi! Sou do time. Qual seu nome?',
          },
          {
            id: 'ask_need',
            type: 'message',
            label: 'Pergunta necessidade',
            content: 'Qual é a sua necessidade agora? (ex: site, tráfego, CRM)',
          },
          {
            id: 'ask_budget',
            type: 'message',
            label: 'Pergunta orçamento',
            content: 'Você já tem um orçamento estimado para isso?',
          },
          { id: 'end', type: 'end', label: 'Fim' },
        ],
        edges: [
          { id: 'e1', source: 'start', target: 'ask_name' },
          { id: 'e2', source: 'ask_name', target: 'ask_need' },
          { id: 'e3', source: 'ask_need', target: 'ask_budget' },
          { id: 'e4', source: 'ask_budget', target: 'end' },
        ],
        isPublic: true,
      },
      {
        name: 'Suporte - Coleta de Dados',
        category: 'SUPPORT',
        description:
          'Coleta dados essenciais antes de abrir ticket para reduzir tempo de primeira resposta.',
        nodes: [
          { id: 'start', type: 'start', label: 'Início' },
          {
            id: 'ask_problem',
            type: 'message',
            label: 'Pergunta problema',
            content: 'Pode descrever rapidamente o problema?',
          },
          {
            id: 'ask_env',
            type: 'message',
            label: 'Ambiente',
            content: 'É web, mobile ou API? Qual navegador/versão?',
          },
          {
            id: 'ask_priority',
            type: 'message',
            label: 'Prioridade',
            content: 'Isso está bloqueando seu uso? (sim/não)',
          },
          { id: 'end', type: 'end', label: 'Fim' },
        ],
        edges: [
          { id: 'e1', source: 'start', target: 'ask_problem' },
          { id: 'e2', source: 'ask_problem', target: 'ask_env' },
          { id: 'e3', source: 'ask_env', target: 'ask_priority' },
          { id: 'e4', source: 'ask_priority', target: 'end' },
        ],
        isPublic: true,
      },
      {
        name: 'Reengajamento Inativo (D+30)',
        category: 'MARKETING',
        description: 'Fluxo de nudge para contatos inativos há 30 dias com CTA claro.',
        nodes: [
          { id: 'start', type: 'start', label: 'Início' },
          {
            id: 'ping',
            type: 'message',
            label: 'Ping',
            content: 'Oi! Vi que você não acessa há um tempo. Posso te ajudar a retomar?',
          },
          {
            id: 'offer',
            type: 'message',
            label: 'Oferta',
            content: 'Se quiser, posso te mostrar as novidades ou montar um plano rápido.',
          },
          { id: 'end', type: 'end', label: 'Fim' },
        ],
        edges: [
          { id: 'e1', source: 'start', target: 'ping' },
          { id: 'e2', source: 'ping', target: 'offer' },
          { id: 'e3', source: 'offer', target: 'end' },
        ],
        isPublic: true,
      },
    ];
  }

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

  async get(id: string) {
    const tpl = await this.prisma.flowTemplate.findUnique({
      where: { id },
    });
    if (!tpl) throw new NotFoundException('Template não encontrado');
    return tpl;
  }

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
