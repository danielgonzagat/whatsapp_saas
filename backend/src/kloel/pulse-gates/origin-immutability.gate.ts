import { Injectable } from '@nestjs/common';
import {
  GENESIS_EVENT,
  GENESIS_EVENT_ID,
  ORGANISM_CANONICAL_NAME,
  computeGenesisHash,
  verifyGenesisEvent,
} from '../lineage/genesis-event';
import { LineageGuardService } from '../lineage/lineage-guard.service';
import {
  fail,
  GateMode,
  GateVerdict,
  pass,
} from './pulse-gates.types';

/**
 * UTP-PULSE-005 — `origin-immutability` gate.
 *
 * Implements PCI.4 §3.6: Genesis Event was never rewritten.
 * Hard-fail since Onda 1 — too critical for log_only.
 *
 * The check has two layers:
 *   1) The compiled-in Genesis constant verifies against itself
 *      (`verifyGenesisEvent(GENESIS_EVENT)` must be true). If this fails,
 *      somebody mutated the source-level constant. The constant is frozen
 *      so this is unreachable in normal operation, but defense in depth.
 *   2) Entry 1 of the persisted ledger matches the canonical Genesis
 *      (delegated to the LineageGuardService verdict).
 */
@Injectable()
export class OriginImmutabilityGate {
  public static readonly DEFAULT_MODE: GateMode = 'hard_fail';
  private static readonly MEASURED_BY = 'origin-immutability.gate';

  public readonly name = 'origin-immutability' as const;

  public constructor(
    private readonly guard: LineageGuardService,
    private readonly mode: GateMode = OriginImmutabilityGate.DEFAULT_MODE,
  ) {}

  public async check(): Promise<GateVerdict> {
    if (!verifyGenesisEvent(GENESIS_EVENT)) {
      return fail(
        'origin-immutability',
        this.mode,
        OriginImmutabilityGate.MEASURED_BY,
        'compiled Genesis constant fails self-verification — source-level mutation detected',
      );
    }
    if (GENESIS_EVENT.payload.canonicalName !== ORGANISM_CANONICAL_NAME) {
      return fail(
        'origin-immutability',
        this.mode,
        OriginImmutabilityGate.MEASURED_BY,
        'canonical name diverged from "Kloel"',
      );
    }
    if (GENESIS_EVENT.eventId !== GENESIS_EVENT_ID) {
      return fail(
        'origin-immutability',
        this.mode,
        OriginImmutabilityGate.MEASURED_BY,
        'Genesis eventId diverged from canonical literal',
      );
    }
    const recomputed = computeGenesisHash(GENESIS_EVENT.payload);
    if (recomputed !== GENESIS_EVENT.hash) {
      return fail(
        'origin-immutability',
        this.mode,
        OriginImmutabilityGate.MEASURED_BY,
        'Genesis hash mismatch on recomputation',
      );
    }
    const verdict = await this.guard.verify();
    if (verdict.status === 'compromised') {
      return fail(
        'origin-immutability',
        this.mode,
        OriginImmutabilityGate.MEASURED_BY,
        verdict.reason ?? 'ledger-stored Genesis tampered',
      );
    }
    return pass('origin-immutability', this.mode, OriginImmutabilityGate.MEASURED_BY);
  }
}

export function makeOriginImmutabilityGate(
  guard: LineageGuardService,
  mode: GateMode = OriginImmutabilityGate.DEFAULT_MODE,
): OriginImmutabilityGate {
  return new OriginImmutabilityGate(guard, mode);
}
