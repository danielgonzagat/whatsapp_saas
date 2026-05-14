import { validateAbiPayload } from '../abi/abi-validator';
import { fail, Gate, GateMode, GateVerdict, pass } from './pulse-gates.types';

/**
 * UTP-PULSE-001 — `no-roleplay` gate.
 *
 * Implements PCI.4 §3.1: payload to LLM contains NO behavioral
 * instruction. Reuses the prompt-leakage scan inside abi-validator (which
 * runs the canonical pattern set) — when ANY PROMPT_LEAKAGE issue surfaces,
 * the gate fails.
 *
 * Default mode in Onda 1: log_only. Transition to hard_fail at Onda 2 per
 * UTP-PULSE-008.
 */
const MEASURED_BY = 'no-roleplay.gate' as const;

export function makeNoRoleplayGate(mode: GateMode = 'log_only'): Gate<unknown> {
  return {
    name: 'no-roleplay',
    mode,
    check: (payload: unknown): GateVerdict => {
      const verdict = validateAbiPayload(payload);
      const offending = verdict.issues.filter((i) => i.code === 'PROMPT_LEAKAGE');
      if (offending.length === 0) {
        return pass('no-roleplay', mode, MEASURED_BY);
      }
      return fail(
        'no-roleplay',
        mode,
        MEASURED_BY,
        `${offending.length} behavioral instruction pattern(s) detected in payload`,
        offending.map((i) => ({ path: i.path, detail: i.message })),
      );
    },
  };
}
