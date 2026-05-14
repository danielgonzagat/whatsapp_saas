import { validateAbiPayload } from '../abi/abi-validator';
import { fail, Gate, GateMode, GateVerdict, pass } from './pulse-gates.types';

/**
 * UTP-PULSE-009 — `no-overclaim` gate (reinforced).
 *
 * Implements PCI.4 §3.4: every available capability must have
 * runtimeEvidencePct > 0. Capability without evidence is overclaim.
 *
 * Default mode: log_only. Hard-fail at Onda 2.
 */
const MEASURED_BY = 'no-overclaim.gate' as const;

export function makeNoOverclaimGate(mode: GateMode = 'log_only'): Gate<unknown> {
  return {
    name: 'no-overclaim',
    mode,
    check: (payload: unknown): GateVerdict => {
      const verdict = validateAbiPayload(payload);
      const offending = verdict.issues.filter((i) => i.code === 'NO_OVERCLAIM');
      if (offending.length === 0) {
        return pass('no-overclaim', mode, MEASURED_BY);
      }
      return fail(
        'no-overclaim',
        mode,
        MEASURED_BY,
        `${offending.length} capability declared without runtime evidence`,
        offending.map((i) => ({ path: i.path, detail: i.message })),
      );
    },
  };
}
