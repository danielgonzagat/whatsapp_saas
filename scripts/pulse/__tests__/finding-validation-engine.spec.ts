import { describe, expect, it } from 'vitest';

import {
  groupVerifiedFindings,
  verifyPulseRawSignal,
  type PulseRawSignal,
} from '../finding-validation-engine';

function signal(overrides: Partial<PulseRawSignal> = {}): PulseRawSignal {
  return {
    detector: 'hardcode-detector',
    type: 'fixed_product_route_collection',
    filePath: 'scripts/pulse/example.ts',
    line: 12,
    evidence: "const routes = ['/checkout']",
    evidenceKind: 'regex',
    blocking: true,
    ...overrides,
  };
}

describe('finding validation engine', () => {
  it('downgrades regex/list/fixed-name-only signals to weak non-blocking findings', () => {
    for (const evidenceKind of ['regex', 'list', 'fixed_name'] as const) {
      const finding = verifyPulseRawSignal(signal({ evidenceKind, blocking: true }));

      expect(finding.truthMode).toBe('weak_signal');
      expect(finding.actionability).toBe('needs_probe');
      expect(finding.falsePositiveRisk).toBe('high');
      expect(finding.blocking).toBe(false);
      expect(finding.evidenceChain).toEqual([
        expect.objectContaining({
          evidenceKind,
          truthMode: 'weak_signal',
          executed: false,
        }),
      ]);
    }
  });

  it('does not allow raw weak signals to lower their false-positive risk', () => {
    const finding = verifyPulseRawSignal(
      signal({ evidenceKind: 'regex', falsePositiveRisk: 'low', blocking: true }),
    );

    expect(finding.truthMode).toBe('weak_signal');
    expect(finding.falsePositiveRisk).toBe('high');
    expect(finding.blocking).toBe(false);
  });

  it('promotes AST, dataflow, and static-confirmed signals to actionable static findings', () => {
    for (const evidenceKind of ['ast', 'dataflow', 'static_confirmed'] as const) {
      const finding = verifyPulseRawSignal(signal({ evidenceKind, blocking: true }));

      expect(finding.truthMode).toBe('confirmed_static');
      expect(finding.actionability).toBe('fix_now');
      expect(finding.falsePositiveRisk).toBe('low');
      expect(finding.blocking).toBe(true);
    }
  });

  it('promotes only executed runtime or external evidence to observed findings', () => {
    const observedRuntime = verifyPulseRawSignal(
      signal({ evidenceKind: 'runtime', executed: true, blocking: true }),
    );
    const observedExternal = verifyPulseRawSignal(
      signal({ evidenceKind: 'external', executed: true, blocking: true }),
    );
    const nonExecutedRuntime = verifyPulseRawSignal(
      signal({ evidenceKind: 'runtime', executed: false, blocking: true }),
    );

    expect(observedRuntime.truthMode).toBe('observed');
    expect(observedRuntime.actionability).toBe('fix_now');
    expect(observedRuntime.blocking).toBe(true);
    expect(observedExternal.truthMode).toBe('observed');
    expect(nonExecutedRuntime.truthMode).toBe('inferred');
    expect(nonExecutedRuntime.actionability).toBe('needs_context');
    expect(nonExecutedRuntime.blocking).toBe(false);
  });

  it('groups duplicate detector/type/file/line/evidence signals and keeps evidence chain', () => {
    const findings = groupVerifiedFindings([
      signal({ evidenceKind: 'regex', message: 'regex hit' }),
      signal({ evidenceKind: 'ast', message: 'AST confirmed' }),
      signal({ line: 13, evidenceKind: 'ast', message: 'different line' }),
      signal({ detector: 'other-detector', evidenceKind: 'ast', message: 'different detector' }),
    ]);

    expect(findings).toHaveLength(3);

    const deduped = findings.find((finding) => finding.detector === 'hardcode-detector');
    expect(deduped).toEqual(
      expect.objectContaining({
        truthMode: 'confirmed_static',
        actionability: 'fix_now',
        falsePositiveRisk: 'low',
      }),
    );
    expect(deduped?.evidenceChain).toHaveLength(2);
    expect(deduped?.evidenceChain.map((item) => item.truthMode)).toEqual([
      'weak_signal',
      'confirmed_static',
    ]);
  });

  it('does not dedupe signals with different evidence text', () => {
    const findings = groupVerifiedFindings([
      signal({ evidence: "const routes = ['/checkout']" }),
      signal({ evidence: "const routes = ['/billing']" }),
    ]);

    expect(findings).toHaveLength(2);
  });

  it('marks ignored findings as non-blocking ignore actions', () => {
    const finding = verifyPulseRawSignal(
      signal({ evidenceKind: 'ast', ignored: true, blocking: true }),
    );

    expect(finding.truthMode).toBe('confirmed_static');
    expect(finding.actionability).toBe('ignore');
    expect(finding.blocking).toBe(false);
  });
});
