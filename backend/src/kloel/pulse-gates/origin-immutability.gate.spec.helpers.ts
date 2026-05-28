import { GENESIS_EVENT, type GenesisPayload } from '../lineage/genesis-event';
import { makeOriginImmutabilityGate } from './origin-immutability.gate';
import type { LineageGuardService, LineageGuardVerdict } from '../lineage/lineage-guard.service';

/**
 * Shared helpers for the origin-immutability gate spec — split out so the
 * main spec stays below the architecture-guard line budget.
 *
 * mockGuard() / gate() fabricate a LineageGuardService verdict and wrap it
 * in a fresh OriginImmutabilityGate instance. cloneGenesisPayload() builds
 * synthetic Genesis payloads for self-verification branch tests.
 */

/**
 * Creates a minimal mock LineageGuardService that returns the given verdict
 * from its verify() method. The gate only calls `guard.verify()` and reads
 * `verdict.status` + `verdict.reason`.
 */
export function mockGuard(verdict: Partial<LineageGuardVerdict> = {}): LineageGuardService {
  return {
    verify: jest.fn<Promise<LineageGuardVerdict>, []>().mockResolvedValue({
      status: 'intact',
      entryCount: 1,
      tailSequenceNumber: 1,
      tailHash: GENESIS_EVENT.hash,
      genesisHash: GENESIS_EVENT.hash,
      checkedAt: new Date().toISOString(),
      ...verdict,
    }),
  } as Partial<LineageGuardService> as LineageGuardService;
}

/**
 * Builds a gate instance with a mock guard.
 */
export function gate(
  mode: 'log_only' | 'hard_fail' = 'hard_fail',
  guardVerdict?: Partial<LineageGuardVerdict>,
) {
  return makeOriginImmutabilityGate(mockGuard(guardVerdict), mode);
}

/**
 * Clones the canonical Genesis payload with optional mutations.
 * Because GENESIS_PAYLOAD is Object.freeze'd at module level, we deep-clone
 * it to produce tampered variants for self-check tests.
 */
export function cloneGenesisPayload(overrides?: Partial<GenesisPayload>): GenesisPayload {
  const orig = GENESIS_EVENT.payload;
  return {
    canonicalName: overrides?.canonicalName ?? orig.canonicalName,
    etymology: overrides?.etymology ?? { ...orig.etymology },
    origin: overrides?.origin ?? { ...orig.origin },
    steward: overrides?.steward ?? { ...orig.steward },
    inviolable: overrides?.inviolable ?? [...orig.inviolable],
    evolvable: overrides?.evolvable ?? [...orig.evolvable],
  };
}
