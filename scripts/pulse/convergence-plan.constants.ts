import type {
  PulseConvergenceProductImpact,
  PulseConvergenceUnit,
  PulseConvergenceUnitPriority,
} from './types';

/** Priority_rank. */
export const PRIORITY_RANK: Record<PulseConvergenceUnitPriority, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

/** Kind_rank. */
export const KIND_RANK: Record<PulseConvergenceUnit['kind'], number> = {
  scenario: 0,
  security: 1,
  runtime: 2,
  change: 3,
  dependency: 4,
  gate: 5,
  scope: 6,
  capability: 7,
  flow: 8,
  static: 9,
};

/** Product_impact_rank. */
export const PRODUCT_IMPACT_RANK: Record<PulseConvergenceProductImpact, number> = {
  transformational: 0,
  material: 1,
  enabling: 2,
  diagnostic: 3,
};
