import { PURCHASE_HISTORY_ALL } from './segmentation.types';
import type { SegmentCriteria } from './segmentation.types';

/**
 * @cluster whatsapp_saas/backend/autopilot
 * Pre-defined segments + descriptions used by the segmentation service.
 *
 * Extracted from `segmentation.helpers.ts` (Gate-fix2-D, 2026-05-28) so the
 * preset catalog can be reviewed in isolation from the Prisma where-builder
 * helpers. Pure data — no Prisma, no I/O.
 */

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
    purchaseHistory: PURCHASE_HISTORY_ALL,
    engagement: 'hot',
  } as SegmentCriteria,

  // Recuperação: compraram mas sumiram
  WINBACK: {
    purchaseHistory: PURCHASE_HISTORY_ALL,
    noMessageDays: 45,
  } as SegmentCriteria,
};

/** Static catalog of preset segments with descriptions for UI listing. */
export const AVAILABLE_PRESETS: {
  name: string;
  description: string;
  criteria: SegmentCriteria;
}[] = [
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
