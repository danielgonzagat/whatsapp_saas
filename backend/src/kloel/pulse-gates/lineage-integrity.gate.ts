import { Injectable } from '@nestjs/common';
import { LineageGuardService } from '../lineage/lineage-guard.service';
import {
  fail,
  GateMode,
  GateVerdict,
  pass,
} from './pulse-gates.types';

/**
 * UTP-PULSE-002 — `lineage-integrity` gate.
 *
 * Implements PCI.4 §3.2: ledger hash-chain intact, entry 1 is canonical
 * Genesis with canonicalName === "Kloel". Hard-fail mode from Onda 1
 * (introduction at hard_fail by design — too critical for log_only).
 *
 * Wraps LineageGuardService.verify() and surfaces its verdict in PULSE
 * gate shape.
 */
@Injectable()
export class LineageIntegrityGate {
  public static readonly DEFAULT_MODE: GateMode = 'hard_fail';
  private static readonly MEASURED_BY = 'lineage-integrity.gate';

  public readonly name = 'lineage-integrity' as const;

  public constructor(
    private readonly guard: LineageGuardService,
    private readonly mode: GateMode = LineageIntegrityGate.DEFAULT_MODE,
  ) {}

  public async check(): Promise<GateVerdict> {
    const v = await this.guard.verify();
    if (v.status === 'intact') {
      return pass('lineage-integrity', this.mode, LineageIntegrityGate.MEASURED_BY);
    }
    return fail(
      'lineage-integrity',
      this.mode,
      LineageIntegrityGate.MEASURED_BY,
      v.reason ?? 'lineage compromise',
      v.offendingEntry
        ? [
            {
              path: `ledgerEntry[seq=${v.offendingEntry.sequenceNumber}]`,
              detail: `${v.offendingEntry.eventName} ${v.offendingEntry.ledgerEntryId}`,
            },
          ]
        : undefined,
    );
  }
}

// Export a non-DI builder for places that already have a LineageGuardService
// instance (tests, scripts).
export function makeLineageIntegrityGate(
  guard: LineageGuardService,
  mode: GateMode = LineageIntegrityGate.DEFAULT_MODE,
): LineageIntegrityGate {
  return new LineageIntegrityGate(guard, mode);
}

