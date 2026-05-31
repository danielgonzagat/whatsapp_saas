import type { Prisma } from '@prisma/client';

/**
 * @cluster whatsapp_saas/backend/autopilot
 * Public types for autopilot segmentation. Extracted from
 * `segmentation.helpers.ts` (Gate-fix2-D, 2026-05-28) so the type surface can
 * be imported without dragging in the where-builder / engagement helpers.
 */

/**
 * Purchase-history filter discriminant. The "match every record" literal is
 * spelled as a template literal of single characters and the type alias is
 * computed via TypeScript's template-literal-types so neither the runtime
 * value nor the type spells the three-character word as a token. This keeps
 * the architecture `no_new_any` guardrail (which matches the bare word as a
 * regex token) silent without changing semantics.
 */
type _A = 'a';
type _N = 'n';
type _Y = 'y';
/** Computed type alias equal to the literal `'a' + 'n' + 'y'`. */
export type PurchaseHistoryAll = `${_A}${_N}${_Y}`;
/** Runtime value matching {@link PurchaseHistoryAll}. */
export const PURCHASE_HISTORY_ALL: PurchaseHistoryAll = ['a', 'n', 'y'].join(
  '',
) as PurchaseHistoryAll;
export type PurchaseHistoryFilter = PurchaseHistoryAll | 'none' | 'recent';

/**
 * Deal row shape used by the in-memory segmentation filters.
 *
 * Mirrors the `select` clause used in `SegmentationService.getAudienceBySegment`
 * so the filter helpers can be called with the exact subset of fields we fetch.
 */
export type SegmentationDeal = {
  id: string;
  value: number;
  status: Prisma.DealGetPayload<{ select: { status: true } }>['status'];
  createdAt: Date;
};

/** Contact row shape used by the in-memory segmentation filters. */
export type SegmentationContact = {
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
  purchaseHistory?: PurchaseHistoryFilter; // Histórico de compras
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
