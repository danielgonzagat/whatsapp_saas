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
  phone: string;
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
  /** Exclude tags property. */
  excludeTags?: string[]; // Tags para excluir

  // Critérios comportamentais
  lastMessageDays?: number; // Mensagens nos últimos X dias
  /** No message days property. */
  noMessageDays?: number; // Sem mensagens há X dias
  /** Purchase history property. */
  purchaseHistory?: 'any' | 'none' | 'recent'; // Histórico de compras
  /** Purchase min value property. */
  purchaseMinValue?: number; // Valor mínimo de compras
  /** Purchase max value property. */
  purchaseMaxValue?: number; // Valor máximo de compras

  // Critérios de engajamento
  openRateMin?: number; // Taxa de abertura mínima (0-1)
  /** Response rate min property. */
  responseRateMin?: number; // Taxa de resposta mínima (0-1)
  /** Engagement property. */
  engagement?: 'hot' | 'warm' | 'cold' | 'ghost';

  // Critérios de pipeline
  stageIds?: string[]; // Estágios específicos do pipeline
  /** Pipeline ids property. */
  pipelineIds?: string[]; // Pipelines específicos
  /** Deal status property. */
  dealStatus?: 'open' | 'won' | 'lost';

  // Critérios temporais
  createdAfter?: Date; // Criado após data
  /** Created before property. */
  createdBefore?: Date; // Criado antes de data

  // Limites
  limit?: number;
}

/** Segment result shape. */
export interface SegmentResult {
  /** Contacts property. */
  contacts: { id: string; phone: string; name?: string }[];
  /** Total property. */
  total: number;
  /** Criteria property. */
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

/** Segmentation service. */
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

  /** Get audience by segment. */
  async getAudienceBySegment(
    workspaceId: string,
    criteria: SegmentCriteria,
  ): Promise<SegmentResult> {
    const where: Prisma.ContactWhereInput = {
      workspaceId,
    };

    const now = new Date();
    this.applyTagFilters(where, criteria);
    this.applyActivityWindowFilters(where, criteria, now);
    this.applyPipelineFilters(where, criteria);

    // Buscar contatos com critérios básicos
    let contacts: SegmentationContact[] = (
      await this.prisma.contact.findMany({
        take: criteria.limit || 1000,
        where: { ...where, workspaceId },
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
      })
    ).map((c) => ({
      id: c.id,
      phone: c.phone,
      name: c.name,
      updatedAt: c.updatedAt,
      deals: c.deals,
    }));

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
        phone: c.phone as string,
        ...(c.name != null ? { name: c.name } : {}),
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

  private computeRecencyFactor(contact: { updatedAt: Date; createdAt: Date }): number {
    const referenceDate =
      contact.updatedAt instanceof Date
        ? contact.updatedAt
        : contact.createdAt instanceof Date
          ? contact.createdAt
          : new Date();
    const daysSinceUpdate = Math.floor((Date.now() - referenceDate.getTime()) / 86400000);
    return Math.max(0, 30 - daysSinceUpdate);
  }

  private computeFrequencyFactor(messages: Array<{ createdAt: Date }>): number {
    const recentMessages = messages.filter((m) => {
      const daysAgo = (Date.now() - m.createdAt.getTime()) / 86400000;
      return daysAgo <= 30;
    });
    return Math.min(25, recentMessages.length * 2);
  }

  private computeResponseRateFactor(messages: Array<{ direction: string }>): number {
    const outbound = messages.filter((m) => m.direction === 'OUTBOUND').length;
    const inbound = messages.filter((m) => m.direction === 'INBOUND').length;
    const responseRate = outbound > 0 ? inbound / outbound : 0;
    return Math.min(25, responseRate * 25);
  }

  private computePurchaseValueFactor(
    deals: Array<{ status: string; value: number | null }>,
  ): number {
    const totalPurchased = deals
      .filter((d) => d.status === 'WON')
      .reduce((sum, d) => sum + (d.value || 0), 0);
    return Math.min(20, totalPurchased / 100);
  }

  private getEngagementLevel(score: number): 'hot' | 'warm' | 'cold' | 'ghost' {
    if (score >= 60) {
      return 'hot';
    }
    if (score >= 35) {
      return 'warm';
    }
    if (score >= 15) {
      return 'cold';
    }
    return 'ghost';
  }

  /**
   * Calcula score de engajamento de um contato
   */
  async calculateEngagementScore(
    contactId: string,
    workspaceId: string,
  ): Promise<{
    score: number;
    level: 'hot' | 'warm' | 'cold' | 'ghost';
    factors: Record<string, number>;
  }> {
    const contactRow = await this.prisma.contact.findFirst({
      where: { id: contactId, workspaceId },
      include: { deals: true },
    });

    if (!contactRow) {
      return { score: 0, level: 'ghost', factors: {} };
    }

    const conversations = await this.prisma.conversation.findMany({
      where: { contactId: contactRow.id, workspaceId: contactRow.workspaceId },
      include: {
        messages: { take: 20, orderBy: { createdAt: 'desc' } },
      },
    });

    const contact = { ...contactRow, conversations };
    const allMessages = contact.conversations.flatMap((c) => c.messages);

    const factors: Record<string, number> = {};
    factors.recency = this.computeRecencyFactor(contact);
    factors.frequency = this.computeFrequencyFactor(allMessages);
    factors.responseRate = this.computeResponseRateFactor(allMessages);
    factors.purchaseValue = this.computePurchaseValueFactor(contact.deals);

    const totalScore =
      factors.recency + factors.frequency + factors.responseRate + factors.purchaseValue;

    return {
      score: Math.round(totalScore),
      level: this.getEngagementLevel(totalScore),
      factors,
    };
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
      where: { workspaceId },
      select: { id: true },
      take: 5000,
      orderBy: { updatedAt: 'desc' },
    });

    const results = { hot: 0, warm: 0, cold: 0, ghost: 0, processed: 0 };

    await forEachSequential(contacts, async (contact) => {
      const { level } = await this.calculateEngagementScore(contact.id, workspaceId);
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
