import { validateAbiPayload } from '../abi/abi-validator';
import { fail, Gate, GateMode, GateVerdict, pass } from './pulse-gates.types';

/**
 * UTP-PULSE-003 — `identity-projection` gate.
 *
 * Implements PCI.4 §3.3: projection in the ABI is consistent with audience
 * (no etymology in `public`, no origin in commercial channel without
 * authorization, etc.). For now, this gate fails when:
 *   - identityProjection.audience is invalid (relies on validator).
 *   - lineage.canonicalName is not "Kloel" (canonical breach).
 *
 * Default mode: log_only. Hard-fail at Onda 2.
 */
const MEASURED_BY = 'identity-projection.gate' as const;

export function makeIdentityProjectionGate(
  mode: GateMode = 'log_only',
): Gate<unknown> {
  return {
    name: 'identity-projection',
    mode,
    check: (payload: unknown): GateVerdict => {
      const verdict = validateAbiPayload(payload);
      const offending = verdict.issues.filter(
        (i) =>
          i.code === 'INVALID_AUDIENCE' ||
          i.code === 'LINEAGE_NAME_MISMATCH' ||
          i.code === 'INVALID_TRUTH_MODE',
      );
      if (offending.length === 0) {
        return pass('identity-projection', mode, MEASURED_BY);
      }
      return fail(
        'identity-projection',
        mode,
        MEASURED_BY,
        `${offending.length} identity-projection issue(s)`,
        offending.map((i) => ({ path: i.path, detail: i.message })),
      );
    },
  };
}
