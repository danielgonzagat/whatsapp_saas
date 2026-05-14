import { validateAbiPayload } from '../abi/abi-validator';
import { fail, Gate, GateMode, GateVerdict, pass } from './pulse-gates.types';

/**
 * UTP-PULSE-007 — `prompt-leakage` gate.
 *
 * Implements PCI.4 §3.8: any string in any field of the payload to the LLM
 * is scanned for behavioral instruction patterns.
 *
 * Functionally identical scope to `no-roleplay` but exists as a discrete
 * gate by PCI.4 — both run at the LLM-emission checkpoint.
 *
 * Default mode: log_only. Hard-fail at Onda 2.
 */
const MEASURED_BY = 'prompt-leakage.gate' as const;

export function makePromptLeakageGate(mode: GateMode = 'log_only'): Gate<unknown> {
  return {
    name: 'prompt-leakage',
    mode,
    check: (payload: unknown): GateVerdict => {
      const verdict = validateAbiPayload(payload);
      const offending = verdict.issues.filter((i) => i.code === 'PROMPT_LEAKAGE');
      if (offending.length === 0) {
        return pass('prompt-leakage', mode, MEASURED_BY);
      }
      return fail(
        'prompt-leakage',
        mode,
        MEASURED_BY,
        `${offending.length} prompt-leakage pattern(s) detected`,
        offending.map((i) => ({ path: i.path, detail: i.message })),
      );
    },
  };
}
