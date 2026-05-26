import {
  makeTruthModeHonestyGate,
  type TruthModeCognitiveCheck,
  type TruthModeItem,
} from './truth-mode-honesty.gate';

/**
 * UTP-PULSE-004 contract spec — truth-mode-honesty gate.
 *
 * 15 scenarios: 8 positive (PASS) + 7 negative (FAIL).
 *
 * Coverage:
 *   - truthMode vs producedBy match / mismatch (items)
 *   - ABI claim without truthMode
 *   - Mixed truthMode under same cognition key
 *   - Terminal event without valence
 *   - Identity projection leak (etymology/origin in public audience)
 *   - Cognitive snapshot combining multiple checks
 */

// ─── helpers ────────────────────────────────────────────────────────────

function gate() {
  return makeTruthModeHonestyGate('hard_fail');
}

function item(
  truthMode: TruthModeItem['truthMode'],
  producedBy: TruthModeItem['producedBy'],
  path?: string,
): TruthModeItem {
  return { truthMode, producedBy, ...(path !== undefined ? { path } : {}) };
}

// ─── positive scenarios (8) ─────────────────────────────────────────────

describe('truth-mode-honesty gate — POSITIVE (PASS)', () => {
  it('PASS: observed / direct', () => {
    expect(gate().check(item('observed', 'direct')).status).toBe('PASS');
  });

  it('PASS: inferred / classifier', () => {
    expect(gate().check(item('inferred', 'classifier')).status).toBe('PASS');
  });

  it('PASS: inferred / model', () => {
    expect(gate().check(item('inferred', 'model')).status).toBe('PASS');
  });

  it('PASS: projected / model', () => {
    expect(gate().check(item('projected', 'model')).status).toBe('PASS');
  });

  it('PASS: projected / simulation', () => {
    expect(gate().check(item('projected', 'simulation')).status).toBe('PASS');
  });

  it('PASS: array of 5 valid items', () => {
    const items: TruthModeItem[] = [
      item('observed', 'direct'),
      item('inferred', 'classifier'),
      item('projected', 'simulation'),
      item('inferred', 'model'),
      item('projected', 'model'),
    ];
    expect(gate().check(items).status).toBe('PASS');
  });

  it('PASS: ABI with valid truthMode + technical audience (etymology allowed)', () => {
    const input: TruthModeCognitiveCheck = {
      kind: 'cognitive',
      abi: {
        identityProjection: { truthMode: 'observed', audience: 'technical' },
        lineage: { etymology: 'origin-branch-alpha' },
      },
    };
    const v = gate().check(input);
    expect(v.status).toBe('PASS');
  });

  it('PASS: cognition entries with consistent truthMode per key + terminal with valence', () => {
    const input: TruthModeCognitiveCheck = {
      kind: 'cognitive',
      entries: [
        {
          key: 'belief.price_sensitivity',
          truthMode: 'inferred',
          path: 'beliefs[0]',
        },
        {
          key: 'belief.price_sensitivity',
          truthMode: 'inferred',
          path: 'beliefs[1]',
        },
        {
          key: 'commerce.sale_closed',
          truthMode: 'observed',
          valence: 'positive',
          isTerminal: true,
          path: 'events[5]',
        },
      ],
    };
    const v = gate().check(input);
    expect(v.status).toBe('PASS');
  });
});

// ─── negative scenarios (7) ─────────────────────────────────────────────

describe('truth-mode-honesty gate — NEGATIVE (FAIL)', () => {
  it('FAIL: classifier mislabeled as observed', () => {
    const v = gate().check(item('observed', 'classifier'));
    expect(v.status).toBe('FAIL');
    expect(v.reason).toMatch(/truthMode dishonesty/i);
    expect(v.evidence).toEqual([
      { path: '$', detail: 'classifier produces inferred but declared observed' },
    ]);
  });

  it('FAIL: simulation mislabeled as observed', () => {
    const v = gate().check(item('observed', 'simulation'));
    expect(v.status).toBe('FAIL');
    expect(v.evidence).toEqual([
      { path: '$', detail: 'simulation produces projected but declared observed' },
    ]);
  });

  it('FAIL: ABI identityProjection without truthMode', () => {
    const input: TruthModeCognitiveCheck = {
      kind: 'cognitive',
      abi: {
        identityProjection: { audience: 'public' },
      },
    };
    const v = gate().check(input);
    expect(v.status).toBe('FAIL');
    expect(v.reason).toMatch(/truthMode dishonesty/i);
    expect(v.evidence?.[0]?.path).toBe('$.identityProjection.truthMode');
    expect(v.evidence?.[0]?.detail).toMatch(/must declare truthMode/);
  });

  it('FAIL: etymology leaking into public audience', () => {
    const input: TruthModeCognitiveCheck = {
      kind: 'cognitive',
      abi: {
        identityProjection: { truthMode: 'observed', audience: 'public' },
        lineage: { etymology: 'forjado-em-beta' },
      },
    };
    const v = gate().check(input);
    expect(v.status).toBe('FAIL');
    expect(v.evidence?.[0]?.path).toBe('$.lineage.etymology');
  });

  it('FAIL: origin leaking into public audience', () => {
    const input: TruthModeCognitiveCheck = {
      kind: 'cognitive',
      abi: {
        identityProjection: { truthMode: 'inferred', audience: 'public' },
        lineage: { origin: 'sys-alpha-v1' },
      },
    };
    const v = gate().check(input);
    expect(v.status).toBe('FAIL');
    expect(v.evidence?.[0]?.path).toBe('$.lineage.origin');
  });

  it('FAIL: mixed truthModes under same cognition key', () => {
    const input: TruthModeCognitiveCheck = {
      kind: 'cognitive',
      entries: [
        { key: 'goal_field.response_tone', truthMode: 'observed', path: 'goals[0]' },
        { key: 'goal_field.response_tone', truthMode: 'inferred', path: 'goals[1]' },
        { key: 'goal_field.response_tone', truthMode: 'projected', path: 'goals[2]' },
      ],
    };
    const v = gate().check(input);
    expect(v.status).toBe('FAIL');
    expect(v.reason).toMatch(/mixed truthModes/i);
    expect(v.evidence?.[0]?.detail).toMatch(/mixed truthModes/i);
  });

  it('FAIL: terminal event without valence', () => {
    const input: TruthModeCognitiveCheck = {
      kind: 'cognitive',
      entries: [
        {
          key: 'commerce.deal_lost',
          truthMode: 'observed',
          isTerminal: true,
          path: 'events[3]',
        },
      ],
    };
    const v = gate().check(input);
    expect(v.status).toBe('FAIL');
    expect(v.evidence?.[0]?.detail).toMatch(/must declare valence/);
  });
});

// ─── edge-case / compound scenarios ─────────────────────────────────────

describe('truth-mode-honesty gate — EDGE', () => {
  it('empty cognitive check (no items, abi, entries) → PASS', () => {
    const v = gate().check({ kind: 'cognitive' });
    expect(v.status).toBe('PASS');
  });

  it('cognitive check with multiple offense categories reports all', () => {
    const input: TruthModeCognitiveCheck = {
      kind: 'cognitive',
      items: [item('observed', 'classifier')],
      abi: {
        identityProjection: { audience: 'public' },
      },
      entries: [
        {
          key: 'commerce.sale_won',
          truthMode: 'observed',
          isTerminal: true,
          path: 'ev[0]',
        },
      ],
    };
    const v = gate().check(input);
    expect(v.status).toBe('FAIL');
    expect(v.reason).toMatch(/3 truthMode dishonesty/);
  });

  it('array of items — one FAIL, one PASS, overall FAIL', () => {
    const v = gate().check([item('observed', 'direct'), item('observed', 'classifier')]);
    expect(v.status).toBe('FAIL');
    expect(v.reason).toMatch(/1 truthMode dishonesty/);
  });

  it('invalid truthMode literal in ABI (not observed/inferred/projected)', () => {
    const input: TruthModeCognitiveCheck = {
      kind: 'cognitive',
      abi: {
        identityProjection: { truthMode: 'magical' },
      },
    };
    const v = gate().check(input);
    expect(v.status).toBe('FAIL');
    expect(v.evidence?.[0]?.detail).toMatch(/invalid truthMode/);
  });

  it('PASS: ABI with public audience, no lineage → no leak', () => {
    const input: TruthModeCognitiveCheck = {
      kind: 'cognitive',
      abi: {
        identityProjection: { truthMode: 'observed', audience: 'public' },
      },
    };
    expect(gate().check(input).status).toBe('PASS');
  });

  it('PASS: cognition entries with single-key single-mode (not mixed)', () => {
    const input: TruthModeCognitiveCheck = {
      kind: 'cognitive',
      entries: [
        { key: 'prediction.active', truthMode: 'projected', path: 'pred[0]' },
        { key: 'prediction.active', truthMode: 'projected', path: 'pred[1]' },
      ],
    };
    expect(gate().check(input).status).toBe('PASS');
  });

  it('PASS: cognition entry with valence present but not terminal → no requirement', () => {
    const input: TruthModeCognitiveCheck = {
      kind: 'cognitive',
      entries: [
        {
          key: 'belief.mood',
          truthMode: 'inferred',
          valence: 'neutral',
        },
      ],
    };
    expect(gate().check(input).status).toBe('PASS');
  });

  it('FAIL: direct measurement declared as inferred (under-claim)', () => {
    const v = gate().check(item('inferred', 'direct'));
    expect(v.status).toBe('FAIL');
    expect(v.evidence).toEqual([
      { path: '$', detail: 'direct produces observed but declared inferred' },
    ]);
  });
});
