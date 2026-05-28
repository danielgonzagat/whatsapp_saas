import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { Prisma } from '@prisma/client';
import { forEachSequential } from '../common/async-sequence';
import { PrismaService } from '../prisma/prisma.service';
import {
  applyActivityWindowFilters,
  applyPipelineFilters,
  applyTagFilters,
  AVAILABLE_PRESETS,
  computeFrequencyFactor,
  computePurchaseValueFactor,
  computeRecencyFactor,
  computeResponseRateFactor,
  filterByEngagement,
  filterByPurchaseHistory,
  filterByPurchaseValue,
  getEngagementLevel,
  PRESET_SEGMENTS,
  type SegmentationContact,
  type SegmentCriteria,
  type SegmentResult,
} from './segmentation.helpers';

/**
 * @cluster whatsapp_saas/backend/autopilot
 * L11 multi-agent TaskGraph annotation (batched by tools/auto-pr/batch-job.mjs).
 */

// Re-exports keep the historical public surface (consumers and the spec import
// `PRESET_SEGMENTS`, `SegmentCriteria`, and `SegmentResult` from this module).
export { PRESET_SEGMENTS };
export type { SegmentCriteria, SegmentResult };

/** Segmentation service. */
@Injectable()
export class SegmentationService {
  private readonly logger = StructuredLogger.from(SegmentationService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Busca contatos com base em critérios avançados de segmentação
   */
  /** Get audience by segment. */
  async getAudienceBySegment(
    workspaceId: string,
    criteria: SegmentCriteria,
  ): Promise<SegmentResult> {
    const where: Prisma.ContactWhereInput = {
      workspaceId,
    };

    const now = new Date();
    applyTagFilters(where, criteria);
    applyActivityWindowFilters(where, criteria, now);
    applyPipelineFilters(where, criteria);

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
      contacts = filterByPurchaseHistory(contacts, criteria.purchaseHistory);
    }

    if (criteria.purchaseMinValue || criteria.purchaseMaxValue) {
      contacts = filterByPurchaseValue(
        contacts,
        criteria.purchaseMinValue,
        criteria.purchaseMaxValue,
      );
    }

    // Filtro por engajamento
    if (criteria.engagement) {
      contacts = filterByEngagement(contacts, criteria.engagement);
    }

    this.logger.log(
      `[Segmentation] Found ${contacts.length} contacts for workspace ${workspaceId}`,
    );

    return {
      contacts: contacts.map((c) => ({
        id: c.id,
        phone: c.phone,
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
    return AVAILABLE_PRESETS;
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
    factors.recency = computeRecencyFactor(contact);
    factors.frequency = computeFrequencyFactor(allMessages);
    factors.responseRate = computeResponseRateFactor(allMessages);
    factors.purchaseValue = computePurchaseValueFactor(contact.deals);

    const totalScore =
      factors.recency + factors.frequency + factors.responseRate + factors.purchaseValue;

    return {
      score: Math.round(totalScore),
      level: getEngagementLevel(totalScore),
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
      results[level] += 1;
      results.processed += 1;
    });

    this.logger.log(
      `[AutoSegment] Workspace ${workspaceId}: Hot=${results.hot}, Warm=${results.warm}, Cold=${results.cold}, Ghost=${results.ghost}`,
    );

    return results;
  }
}
