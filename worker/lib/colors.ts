/**
 * KLOEL Worker — Color Tokens
 *
 * Single source of truth for colors used in worker-generated HTML
 * (fallback emails) and DB seed defaults (pipeline stages).
 *
 * This mirrors the backend tokens in backend/src/common/kloel-colors.ts
 * and the canonical palette in ops/kloel-design-tokens.json.
 */

export const PIPELINE_COLORS = {
  /** Default stage color for auto-created pipeline stages. Maps to backend PIPELINE_STAGE_COLORS.LEAD_BLUE. */
  DEFAULT_STAGE: '#3B82F6',
} as const;
