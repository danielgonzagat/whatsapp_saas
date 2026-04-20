import { Injectable, Logger } from '@nestjs/common';
import { DealStatus, Prisma } from '@prisma/client';
import { forEachSequential } from '../common/async-sequence';
import { PrismaService } from '../prisma/prisma.service';

const DEAL_STATUS_VALUES = new Set<string>(Object.values(DealStatus));

const isDealStatus = (value: string): value is DealStatus => DEAL_STATUS_VALUES.has(value);

/**
 * Deal row shape used by the in-memory segmentation filters.
 *
 * Mirrors the `select` clause used in {@link SegmentationService.getAudienceBySegment}
 * so the filter helpers can be called with the exact subset of fields we fetch.
 */
type SegmentationDeal = {
  id: string;
  value: number;
  status: Prisma.DealGetPayload<{ select: { status: true } }>['status'];
  createdAt: Date;
};

/**
 * Contact row shape used by the in-memory segmentation filters.
 */
type SegmentationContact = {
  id: string;
  phone: string | null;
  name: string | null;
  updatedAt: Date;
  deals: SegmentationDeal[];
};

/**
 * Tipos de segmentação suportados
 */
export interface SegmentCriteria {
  // Critérios demográficos
  tags?: string[]; // Tags do contato
  excludeTags?: string[]; // Tags para excluir

  // Critérios comportamentais
  lastMessageDays?: number; // Mensagens nos últimos X dias
  noMessageDays?: number; // Sem mensagens há X dias
  purchaseHistory?: 'any' | 'none' | 'recent'; // Histórico de compras
  purchaseMinValue?: number; // Valor mínimo de compras
  purchaseMaxValue?: number; // Valor máximo de compras

  // Critérios de engajamento
  openRateMin?: number; // Taxa de abertura mínima (0-1)
  responseRateMin?: number; // Taxa de resposta mínima (0-1)
  engagement?: 'hot' | 'warm' | 'cold' | 'ghost';

  // Critérios de pipeline
  stageIds?: string[]; // Estágios específicos do pipeline
  pipelineIds?: string[]; // Pipelines específicos
  dealStatus?: 'open' | 'won' | 'lost';

  // Critérios temporais
  createdAfter?: Date; // Criado após data
  createdBefore?: Date; // Criado antes de data

  // Limites
  limit?: number;
}

export interface SegmentResult {
  contacts: { id: string; phone: string; name?: string }[];
  total: number;
  criteria: SegmentCriteria;
}

/**
 * Segmentos pré-definidos para uso rápido
 */
export const PRESET_SEGMENTS = {
  // Leads quentes: interagiram recentemente
  HOT_LEADS: {
    lastMessageDays: 3,
    engagement: 'hot',
  } as SegmentCriteria,

  // Leads mornos: interagiram mas esfriando
  WARM_LEADS: {
    lastMessageDays: 14,
    noMessageDays: 3,
    engagement: 'warm',
  } as SegmentCriteria,

  // Leads frios: não interagem há tempo
  COLD_LEADS: {
    noMessageDays: 30,
    engagement: 'cold',
  } as SegmentCriteria,

  // Fantasmas: sumiram completamente
  GHOST_LEADS: {
    noMessageDays: 60,
    engagement: 'ghost',
  } as SegmentCriteria,

  // Compradores recentes
  RECENT_BUYERS: {
    purchaseHistory: 'recent',
    lastMessageDays: 30,
  } as SegmentCriteria,

  // Alto valor: gastaram muito
  HIGH_VALUE: {
    purchaseMinValue: 1000,
  } as SegmentCriteria,

  // Nunca compraram
  NEVER_BOUGHT: {
    purchaseHistory: 'none',
    lastMessageDays: 90,
  } as SegmentCriteria,

  // Prontos para upsell: compraram e estão engajados
  UPSELL_READY: {
    purchaseHistory: 'any',
    engagement: 'hot',
  } as SegmentCriteria,

  // Recuperação: compraram mas sumiram
  WINBACK: {
    purchaseHistory: 'any',
    noMessageDays: 45,
  } as SegmentCriteria,
};

@Injectable()
export class SegmentationService {
  private readonly logger = new Logger(SegmentationService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Busca contatos com base em critérios avançados de segmentação
   */
  private applyTagFilters(where: Prisma.ContactWhereInput, criteria: SegmentCriteria): void {
    if (criteria.tags && criteria.tags.length > 0) {
      where.tags = { some: { name: { in: criteria.tags } } };
    }
    if (criteria.excludeTags && criteria.excludeTags.length > 0) {
      where.NOT = { tags: { some: { name: { in: criteria.excludeTags } } } };
    }
  }

  private applyActivityWindowFilters(
    where: Prisma.ContactWhereInput,
    criteria: SegmentCriteria,
    now: Date,
  ): void {
    const updatedAtFilter: Prisma.DateTimeFilter<'Contact'> = {};
    if (criteria.lastMessageDays) {
      const since = new Date(now);
      since.setDate(since.getDate() - criteria.lastMessageDays);
      updatedAtFilter.gte = since;
    }
    if (criteria.noMessageDays) {
      const before = new Date(now);
      before.setDate(before.getDate() - criteria.noMessageDays);
      updatedAtFilter.lte = before;
    }
    if (updatedAtFilter.gte !== undefined || updatedAtFilter.lte !== undefined) {
      where.updatedAt = updatedAtFilter;
    }

    const createdAtFilter: Prisma.DateTimeFilter<'Contact'> = {};
    if (criteria.createdAfter) {
      createdAtFilter.gte = criteria.createdAfter;
    }
    if (criteria.createdBefore) {
      createdAtFilter.lte = criteria.createdBefore;
    }
    if (createdAtFilter.gte !== undefined || createdAtFilter.lte !== undefined) {
      where.createdAt = createdAtFilter;
    }
  }

  private applyPipelineFilters(where: Prisma.ContactWhereInput, criteria: SegmentCriteria): void {
    if (criteria.stageIds && criteria.stageIds.length > 0) {
      where.deals = { some: { stageId: { in: criteria.stageIds } } };
    }
    if (criteria.pipelineIds && criteria.pipelineIds.length > 0) {
      where.deals = {
        some: { stage: { pipelineId: { in: criteria.pipelineIds } } },
      };
    }
    if (criteria.dealStatus) {
      const statusMap: Record<'open' | 'won' | 'lost', string[]> = {
        open: ['OPEN', 'NEGOTIATION'],
        won: ['WON'],
        lost: ['LOST'],
      };
      const validStatuses: DealStatus[] = (statusMap[criteria.dealStatus] || []).filter(
        isDealStatus,
      );
      where.deals = { some: { status: { in: validStatuses } } };
    }
  }

  async getAudienceBySegment(
    workspaceId: string,
    criteria: SegmentCriteria,
  ): Promise<SegmentResult> {
    const where: Prisma.ContactWhereInput = {
      workspaceId,
      phone: { not: null },
    };

    const now = new Date();
    this.applyTagFilters(where, criteria);
    this.applyActivityWindowFilters(where, criteria, now);
    this.applyPipelineFilters(where, criteria);

    // Buscar contatos com critérios básicos
    let contacts = await this.prisma.contact.findMany({
      take: criteria.limit || 1000,
      where,
      select: {
        id: true,
        phone: true,
        name: true,
        updatedAt: true,
        deals: {
          select: {
            id: true,
            value: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    // Filtros pós-query (histórico de compras)
    if (criteria.purchaseHistory) {
      contacts = this.filterByPurchaseHistory(contacts, criteria.purchaseHistory);
    }

    if (criteria.purchaseMinValue || criteria.purchaseMaxValue) {
      contacts = this.filterByPurchaseValue(
        contacts,
        criteria.purchaseMinValue,
        criteria.purchaseMaxValue,
      );
    }

    // Filtro por engajamento
    if (criteria.engagement) {
      contacts = this.filterByEngagement(contacts, criteria.engagement);
    }

    this.logger.log(
      `[Segmentation] Found ${contacts.length} contacts for workspace ${workspaceId}`,
    );

    return {
      contacts: contacts.map((c) => ({
        id: c.id,
        phone: c.phone,
        name: c.name || undefined,
      })),
      total: contacts.length,
      criteria,
    };
  }

  /**
   * Obtém um segmento pré-definido
   */
  async getPresetSegment(
    workspaceId: string,
    presetName: keyof typeof PRESET_SEGMENTS,
    overrides?: Partial<SegmentCriteria>,
  ): Promise<SegmentResult> {
    const baseCriteria = PRESET_SEGMENTS[presetName];
    const criteria = { ...baseCriteria, ...overrides };
    return this.getAudienceBySegment(workspaceId, criteria);
  }

  /**
   * Lista todos os segmentos pré-definidos disponíveis
   */
  getAvailablePresets(): {
    name: string;
    description: string;
    criteria: SegmentCriteria;
  }[] {
    return [
      {
        name: 'HOT_LEADS',
        description: 'Leads que interagiram nos últimos 3 dias',
        criteria: PRESET_SEGMENTS.HOT_LEADS,
      },
      {
        name: 'WARM_LEADS',
        description: 'Leads que interagiram há 3-14 dias',
        criteria: PRESET_SEGMENTS.WARM_LEADS,
      },
      {
        name: 'COLD_LEADS',
        description: 'Leads sem interação há 30+ dias',
        criteria: PRESET_SEGMENTS.COLD_LEADS,
      },
      {
        name: 'GHOST_LEADS',
        description: 'Leads sem interação há 60+ dias',
        criteria: PRESET_SEGMENTS.GHOST_LEADS,
      },
      {
        name: 'RECENT_BUYERS',
        description: 'Compradores dos últimos 30 dias',
        criteria: PRESET_SEGMENTS.RECENT_BUYERS,
      },
      {
        name: 'HIGH_VALUE',
        description: 'Clientes que gastaram R$1000+',
        criteria: PRESET_SEGMENTS.HIGH_VALUE,
      },
      {
        name: 'NEVER_BOUGHT',
        description: 'Leads que nunca compraram',
        criteria: PRESET_SEGMENTS.NEVER_BOUGHT,
      },
      {
        name: 'UPSELL_READY',
        description: 'Compradores engajados para upsell',
        criteria: PRESET_SEGMENTS.UPSELL_READY,
      },
      {
        name: 'WINBACK',
        description: 'Compradores antigos para reativação',
        criteria: PRESET_SEGMENTS.WINBACK,
      },
    ];
  }

  /**
   * Calcula score de engajamento de um contato
   */
  async calculateEngagementScore(contactId: string): Promise<{
    score: number;
    level: 'hot' | 'warm' | 'cold' | 'ghost';
    factors: Record<string, number>;
  }> {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      include: {
        conversations: {
          include: {
            messages: {
              take: 20,
              orderBy: { createdAt: 'desc' },
            },
          },
        },
        deals: true,
      },
    });

    if (!contact) {
      return { score: 0, level: 'ghost', factors: {} };
    }

    const factors: Record<string, number> = {};
    let totalScore = 0;

    // Fator 1: Recência (0-30 pontos) - usando updatedAt
    const referenceDate =
      contact.updatedAt instanceof Date
        ? contact.updatedAt
        : contact.createdAt instanceof Date
          ? contact.createdAt
          : new Date();
    const daysSinceUpdate = Math.floor(
      (Date.now() - referenceDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    factors.recency = Math.max(0, 30 - daysSinceUpdate);
    totalScore += factors.recency;

    // Fator 2: Frequência de mensagens (0-25 pontos)
    const allMessages = contact.conversations.flatMap((c) => c.messages);
    const recentMessages = allMessages.filter((m) => {
      const daysAgo = (Date.now() - m.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      return daysAgo <= 30;
    });
    factors.frequency = Math.min(25, recentMessages.length * 2);
    totalScore += factors.frequency;

    // Fator 3: Taxa de resposta (0-25 pontos)
    const outbound = allMessages.filter((m) => m.direction === 'OUTBOUND').length;
    const inbound = allMessages.filter((m) => m.direction === 'INBOUND').length;
    const responseRate = outbound > 0 ? inbound / outbound : 0;
    factors.responseRate = Math.min(25, responseRate * 25);
    totalScore += factors.responseRate;

    // Fator 4: Valor de compras (0-20 pontos)
    const totalPurchased = contact.deals
      .filter((d) => d.status === 'WON')
      .reduce((sum, d) => sum + (d.value || 0), 0);
    factors.purchaseValue = Math.min(20, totalPurchased / 100);
    totalScore += factors.purchaseValue;

    // Determinar nível
    let level: 'hot' | 'warm' | 'cold' | 'ghost';
    if (totalScore >= 60) {
      level = 'hot';
    } else if (totalScore >= 35) {
      level = 'warm';
    } else if (totalScore >= 15) {
      level = 'cold';
    } else {
      level = 'ghost';
    }

    return { score: Math.round(totalScore), level, factors };
  }

  /**
   * Segmenta contatos automaticamente por score
   */
  async autoSegmentWorkspace(workspaceId: string): Promise<{
    hot: number;
    warm: number;
    cold: number;
    ghost: number;
    processed: number;
  }> {
    const contacts = await this.prisma.contact.findMany({
      where: { workspaceId, phone: { not: null } },
      select: { id: true },
      take: 5000,
      orderBy: { updatedAt: 'desc' },
    });

    const results = { hot: 0, warm: 0, cold: 0, ghost: 0, processed: 0 };

    await forEachSequential(contacts, async (contact) => {
      const { level } = await this.calculateEngagementScore(contact.id);
      results[level]++;
      results.processed++;
    });

    this.logger.log(
      `[AutoSegment] Workspace ${workspaceId}: Hot=${results.hot}, Warm=${results.warm}, Cold=${results.cold}, Ghost=${results.ghost}`,
    );

    return results;
  }

  // === Métodos auxiliares privados ===

  private filterByPurchaseHistory(
    contacts: SegmentationContact[],
    history: 'any' | 'none' | 'recent',
  ): SegmentationContact[] {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    return contacts.filter((c) => {
      const wonDeals = (c.deals ?? []).filter((d) => d.status === DealStatus.WON);

      switch (history) {
        case 'any':
          return wonDeals.length > 0;
        case 'none':
          return wonDeals.length === 0;
        case 'recent':
          return wonDeals.some((d) => new Date(d.createdAt) >= thirtyDaysAgo);
        default:
          return true;
      }
    });
  }

  private filterByPurchaseValue(
    contacts: SegmentationContact[],
    minValue?: number,
    maxValue?: number,
  ): SegmentationContact[] {
    return contacts.filter((c) => {
      const totalValue = (c.deals ?? [])
        .filter((d) => d.status === DealStatus.WON)
        .reduce((sum, d) => sum + (d.value || 0), 0);

      if (minValue !== undefined && totalValue < minValue) {
        return false;
      }
      if (maxValue !== undefined && totalValue > maxValue) {
        return false;
      }
      return true;
    });
  }

  private filterByEngagement(
    contacts: SegmentationContact[],
    engagement: 'hot' | 'warm' | 'cold' | 'ghost',
  ): SegmentationContact[] {
    const now = Date.now();

    return contacts.filter((c) => {
      const lastActivity = c.updatedAt ? new Date(c.updatedAt).getTime() : 0;
      const daysSince = Math.floor((now - lastActivity) / (1000 * 60 * 60 * 24));

      switch (engagement) {
        case 'hot':
          return daysSince <= 3;
        case 'warm':
          return daysSince > 3 && daysSince <= 14;
        case 'cold':
          return daysSince > 14 && daysSince <= 60;
        case 'ghost':
          return daysSince > 60;
        default:
          return true;
      }
    });
  }
}
