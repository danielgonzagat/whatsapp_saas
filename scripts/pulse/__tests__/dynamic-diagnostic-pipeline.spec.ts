import { describe, expect, it } from 'vitest';
import { calculateDynamicRisk } from '../dynamic-risk-model';
import { synthesizeDiagnostic } from '../diagnostic-synthesizer';
import { synthesizeProofPlan } from '../proof-synthesizer';
import { buildPredicateGraph } from '../predicate-graph';
import { buildPulseSignalGraph } from '../signal-graph';
import { synthesizeDiagnosticFromBreaks } from '../legacy-break-adapter';

describe('dynamic diagnostic pipeline', () => {
  it('generates diagnostics from evidence and predicates instead of fixed problem names', () => {
    const signalGraph = buildPulseSignalGraph(
      [
        {
          source: 'ast:dataflow',
          detector: 'behavioral-sensor',
          truthMode: 'confirmed_static',
          summary: 'External request input reaches durable mutation without control evidence',
          location: { file: 'src/example.ts', line: 10 },
        },
      ],
      '2026-04-30T00:00:00.000Z',
    );
    const predicateGraph = buildPredicateGraph(signalGraph);
    const risk = calculateDynamicRisk({ predicateGraph, runtimeImpact: 0.4 });
    const diagnostic = synthesizeDiagnostic(signalGraph, predicateGraph, risk);
    const proof = synthesizeProofPlan(diagnostic);

    expect(diagnostic.title).not.toMatch(/^[A-Z0-9_]+$/);
    expect(diagnostic.predicateKinds).toContain('external_input');
    expect(diagnostic.predicateKinds).toContain('durable_mutation');
    expect(diagnostic.riskScore).toBeGreaterThan(0);
    expect(proof.requirements.map((item) => item.kind)).toContain('state_effect_probe');
  });

  it('keeps legacy break labels out of generated diagnostic titles', () => {
    const diagnostic = synthesizeDiagnosticFromBreaks([
      {
        type: 'behavioral-control-evidence-gap',
        severity: 'high',
        file: 'src/example.ts',
        line: 12,
        description: 'Regex heuristic saw external input with durable mutation and missing control',
        detail: 'behavioral-control-evidence-gap is compatibility metadata only',
        source: 'regex-heuristic:guard-auditor',
      },
    ]);

    expect(diagnostic.title).not.toContain('behavioral-control-evidence-gap');
    expect(diagnostic.summary).not.toContain('behavioral-control-evidence-gap');
    expect(diagnostic.predicateKinds).toContain('external_input');
  });
});
