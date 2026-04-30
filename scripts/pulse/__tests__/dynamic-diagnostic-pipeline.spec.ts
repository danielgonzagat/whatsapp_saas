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
    expect(diagnostic.predicateKinds).toContain('evidence_external_request');
    expect(diagnostic.predicateKinds).toContain('evidence_durable_mutation');
    expect(diagnostic.riskScore).toBeGreaterThan(0);
    expect(proof.requirements.map((item) => item.kind)).toContain(
      'prove_evidence_durable_mutation',
    );
  });

  it('keeps legacy break labels out of generated diagnostic titles', () => {
    const legacyLabel = 'behavioral-control-evidence-gap';
    const diagnostic = synthesizeDiagnosticFromBreaks([
      {
        type: legacyLabel,
        severity: 'high',
        file: 'src/example.ts',
        line: 12,
        description: `${legacyLabel}: regex heuristic saw external input with durable mutation and missing control`,
        detail: `${legacyLabel} is compatibility metadata only`,
        source: `regex-heuristic:${legacyLabel}`,
      },
    ]);

    expect(diagnostic.id).not.toContain(legacyLabel);
    expect(diagnostic.title).not.toContain(legacyLabel);
    expect(diagnostic.summary).not.toContain(legacyLabel);
    expect(diagnostic.predicateKinds).toContain('evidence_external_input');
  });

  it('prioritizes observed evidence over weaker truth modes in generated summaries', () => {
    const signalGraph = buildPulseSignalGraph(
      [
        {
          source: 'regex:scan',
          detector: 'weak-parser',
          truthMode: 'weak_signal',
          summary: 'Weak scanner found possible queue failure',
          location: { file: 'src/queue.ts', line: 4 },
        },
        {
          source: 'runtime:probe',
          detector: 'runtime-probe',
          truthMode: 'observed',
          summary: 'Runtime probe observed queue retry exhaustion',
          location: { file: 'src/queue.ts', line: 18 },
        },
        {
          source: 'ast:graph',
          detector: 'static-parser',
          truthMode: 'confirmed_static',
          summary: 'Static graph confirmed queue retry branch',
          location: { file: 'src/queue.ts', line: 12 },
        },
      ],
      '2026-04-30T01:00:00.000Z',
    );
    const predicateGraph = buildPredicateGraph(signalGraph);
    const risk = calculateDynamicRisk({ predicateGraph });
    const diagnostic = synthesizeDiagnostic(signalGraph, predicateGraph, risk);

    expect(diagnostic.summary).toContain('Runtime probe observed queue retry exhaustion');
    expect(diagnostic.title).toMatch(/Runtime|Probe|Observed|Queue|Retry|Exhaustion/);
    expect(risk.drivers[0]).toBe('truth_observed');
  });
});
