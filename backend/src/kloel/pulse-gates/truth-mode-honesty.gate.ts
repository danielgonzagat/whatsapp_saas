import { fail, Gate, GateMode, GateVerdict, pass } from './pulse-gates.types';

/**
 * UTP-PULSE-004 — `truth-mode-honesty` gate.
 *
 * Implements PCI.4 §3.5: cognitive output declares truthMode that matches
 * how the content was produced. Misclassifying a model output as `observed`
 * is a hard failure; using `inferred` for direct measurement is also a
 * (lighter) failure — under-claim still bad for epistemics.
 *
 * The check operates on a generic shape:
 *   { truthMode: 'observed' | 'inferred' | 'projected', producedBy: 'direct' | 'classifier' | 'model' | 'simulation' }
 *
 * - direct measurement → must declare observed
 * - classifier output → must declare inferred
 * - model/projection → must declare projected
 *
 * Default mode: log_only. Hard-fail at Onda 3.
 */
const MEASURED_BY = 'truth-mode-honesty.gate' as const;

export type TruthModeHonestyInput = {
  readonly truthMode: 'observed' | 'inferred' | 'projected';
  readonly producedBy: 'direct' | 'classifier' | 'model' | 'simulation';
  readonly path?: string;
};

const COMPATIBLE: Record<
  TruthModeHonestyInput['producedBy'],
  ReadonlySet<TruthModeHonestyInput['truthMode']>
> = {
  direct: new Set(['observed']),
  classifier: new Set(['inferred']),
  model: new Set(['inferred', 'projected']),
  simulation: new Set(['projected']),
};

export function makeTruthModeHonestyGate(
  mode: GateMode = 'log_only',
): Gate<TruthModeHonestyInput | readonly TruthModeHonestyInput[]> {
  return {
    name: 'truth-mode-honesty',
    mode,
    check: (input): GateVerdict => {
      const items = Array.isArray(input) ? input : [input];
      const offending: { path: string; reason: string }[] = [];
      for (const it of items) {
        const allowed = COMPATIBLE[it.producedBy];
        if (!allowed.has(it.truthMode)) {
          offending.push({
            path: it.path ?? '$',
            reason: `${it.producedBy} produces ${[...allowed].join('|')} but declared ${it.truthMode}`,
          });
        }
      }
      if (offending.length === 0) {
        return pass('truth-mode-honesty', mode, MEASURED_BY);
      }
      return fail(
        'truth-mode-honesty',
        mode,
        MEASURED_BY,
        `${offending.length} truthMode mismatch(es)`,
        offending.map((o) => ({ path: o.path, detail: o.reason })),
      );
    },
  };
}
