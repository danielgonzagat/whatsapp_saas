/**
 * Shared types extracted from {@link LeadMindCoordinator} so helpers and the
 * service can talk in a stable vocabulary without a circular import.
 *
 * Wave Claude-w119 — refactor(kloel/lead-mind): extract pure helpers.
 *
 * @cluster Mind/Coordination
 */

/** Coarse buy-intent classification surfaced by `detectBuyIntent`. */
export type BuyIntent = 'high' | 'medium' | 'low' | 'objection';
