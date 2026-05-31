import {
  buildInspectSelfWorkQueue,
  computeCognitiveGaps,
  normalizeIdentityAudience,
  readOptionalNum,
  readOptionalStr,
  selectSilentSurfaces,
  type DissolutionGapLike,
} from './mind-capability-executor.helpers';

describe('mind-capability-executor.helpers (cognitive + readers)', () => {
  describe('readOptionalNum', () => {
    it('returns floored integer when value is a positive finite number', () => {
      expect(readOptionalNum(12.7, 1)).toBe(12);
      expect(readOptionalNum(3, 1)).toBe(3);
    });

    it('parses numeric strings', () => {
      expect(readOptionalNum('25', 1)).toBe(25);
      expect(readOptionalNum('25.9', 1)).toBe(25);
    });

    it('falls back when value is zero, negative, NaN, Infinity, or undefined', () => {
      expect(readOptionalNum(0, 7)).toBe(7);
      expect(readOptionalNum(-5, 7)).toBe(7);
      expect(readOptionalNum(Number.NaN, 7)).toBe(7);
      expect(readOptionalNum(Number.POSITIVE_INFINITY, 7)).toBe(7);
      expect(readOptionalNum(undefined, 7)).toBe(7);
      expect(readOptionalNum(null, 7)).toBe(7);
    });

    it('falls back when value is a non-numeric string or non-coercible type', () => {
      expect(readOptionalNum('abc', 9)).toBe(9);
      expect(readOptionalNum({}, 9)).toBe(9);
      // Number([]) === 0 falls back, Number([5]) === 5 does not.
      expect(readOptionalNum(['x', 'y'], 9)).toBe(9);
    });

    it('coerces JS-truthy primitives via Number() (documents the contract)', () => {
      // Number(true) === 1 and Number([5]) === 5 — both positive finite, so
      // they are accepted. This is the documented behavior of readOptionalNum:
      // it trusts the Number() coercion. Callers must validate type first if
      // they need stricter input.
      expect(readOptionalNum(true, 9)).toBe(1);
      expect(readOptionalNum([5], 9)).toBe(5);
    });
  });

  describe('readOptionalStr', () => {
    it('returns the trimmed string when value is a non-empty string', () => {
      expect(readOptionalStr('  hello  ')).toBe('hello');
      expect(readOptionalStr('keep')).toBe('keep');
    });

    it('falls back to empty string by default for empty, whitespace, or non-string values', () => {
      expect(readOptionalStr('')).toBe('');
      expect(readOptionalStr('   ')).toBe('');
      expect(readOptionalStr(undefined)).toBe('');
      expect(readOptionalStr(null)).toBe('');
      expect(readOptionalStr(42)).toBe('');
      expect(readOptionalStr({})).toBe('');
    });

    it('respects an explicit fallback', () => {
      expect(readOptionalStr('', 'default')).toBe('default');
      expect(readOptionalStr(undefined, 'default')).toBe('default');
      expect(readOptionalStr('   ', 'default')).toBe('default');
    });
  });

  describe('computeCognitiveGaps', () => {
    it('returns cognitive_state_unavailable when abi is null, undefined, or non-object', () => {
      expect(computeCognitiveGaps(null)).toEqual(['cognitive_state_unavailable']);
      expect(computeCognitiveGaps(undefined)).toEqual(['cognitive_state_unavailable']);
      expect(computeCognitiveGaps('a string')).toEqual(['cognitive_state_unavailable']);
      expect(computeCognitiveGaps(42)).toEqual(['cognitive_state_unavailable']);
    });

    it('returns an empty list when every checked array is populated and lineage is intact', () => {
      const abi = {
        capabilities: { available: [{ id: 'x' }] },
        beliefs: [{ id: 'b' }],
        memory: {
          workingMemory: [{ id: 'w' }],
          episodicRefs: [{ id: 'e' }],
          consolidatedRefs: [{ id: 'c' }],
        },
        predictions: { active: [{ id: 'p' }] },
        perception: { recentSalientEvents: [{ id: 's' }] },
        lineage: { status: 'intact' },
        pulseTruth: { certificationVerdict: 'PASS' },
      };
      // top-level capabilities is the array form; with the nested-array seeded
      // above the top-level still needs to be a non-empty array for the
      // `[capabilities]` check.
      // Replace with combined fixture covering both branches:
      const populated = {
        ...abi,
        capabilities: [{ id: 'top' }, { id: 'top-2' }],
      };
      expect(computeCognitiveGaps(populated)).toEqual([]);
    });

    it('flags every empty-array path with its canonical label', () => {
      const abi = {
        capabilities: [],
        beliefs: [],
        memory: { workingMemory: [], episodicRefs: [], consolidatedRefs: [] },
        predictions: { active: [] },
        perception: { recentSalientEvents: [] },
      };
      const gaps = computeCognitiveGaps(abi);
      expect(gaps).toEqual(
        expect.arrayContaining([
          'no_capabilities_declared',
          'no_beliefs_formed',
          'working_memory_empty',
          'no_episodic_memory',
          'no_consolidated_memory',
          'no_active_predictions',
          'perception_loop_silent',
        ]),
      );
    });

    it('flags nested capabilities.available emptiness independently of top-level capabilities', () => {
      const abi = {
        capabilities: { available: [] },
      };
      const gaps = computeCognitiveGaps(abi);
      expect(gaps).toContain('no_capabilities_available');
    });

    it('skips paths that simply do not exist on the abi object', () => {
      const abi = { capabilities: [{ id: 'x' }] };
      const gaps = computeCognitiveGaps(abi);
      // Paths that don't exist are not flagged (only empty arrays are).
      expect(gaps).not.toContain('no_capabilities_declared');
    });

    it('appends a lineage_<status> gap when lineage.status is a non-intact string', () => {
      expect(computeCognitiveGaps({ lineage: { status: 'compromised' } })).toContain(
        'lineage_compromised',
      );
      expect(computeCognitiveGaps({ lineage: { status: 'fractured' } })).toContain(
        'lineage_fractured',
      );
    });

    it('does not append a lineage gap when lineage.status is intact or non-string', () => {
      const gapsIntact = computeCognitiveGaps({ lineage: { status: 'intact' } });
      expect(gapsIntact.some((g) => g.startsWith('lineage_'))).toBe(false);

      const gapsNumeric = computeCognitiveGaps({ lineage: { status: 7 } });
      expect(gapsNumeric.some((g) => g.startsWith('lineage_'))).toBe(false);
    });

    it('appends a lowercased pulse gap when pulseTruth.certificationVerdict is non-PASS', () => {
      expect(
        computeCognitiveGaps({ pulseTruth: { certificationVerdict: 'NOT_CERTIFIED' } }),
      ).toContain('pulse_not_certified');
      expect(computeCognitiveGaps({ pulseTruth: { certificationVerdict: 'FAIL' } })).toContain(
        'pulse_fail',
      );
    });

    it('does not append a pulse gap when verdict is PASS or non-string', () => {
      const gapsPass = computeCognitiveGaps({ pulseTruth: { certificationVerdict: 'PASS' } });
      expect(gapsPass.some((g) => g.startsWith('pulse_'))).toBe(false);

      const gapsMissing = computeCognitiveGaps({ pulseTruth: { certificationVerdict: 42 } });
      expect(gapsMissing.some((g) => g.startsWith('pulse_'))).toBe(false);
    });

    it('combines empty-array flags with lineage and pulse flags into a single list', () => {
      const gaps = computeCognitiveGaps({
        beliefs: [],
        lineage: { status: 'broken' },
        pulseTruth: { certificationVerdict: 'CRITICAL' },
      });
      expect(gaps).toEqual(
        expect.arrayContaining(['no_beliefs_formed', 'lineage_broken', 'pulse_critical']),
      );
    });
  });

  describe('normalizeIdentityAudience', () => {
    it('returns each known audience unchanged', () => {
      expect(normalizeIdentityAudience('public')).toBe('public');
      expect(normalizeIdentityAudience('technical')).toBe('technical');
      expect(normalizeIdentityAudience('origin')).toBe('origin');
      expect(normalizeIdentityAudience('internal')).toBe('internal');
    });

    it('falls back to "internal" for unknown or non-string values', () => {
      expect(normalizeIdentityAudience('admin')).toBe('internal');
      expect(normalizeIdentityAudience('')).toBe('internal');
      expect(normalizeIdentityAudience(undefined)).toBe('internal');
      expect(normalizeIdentityAudience(null)).toBe('internal');
      expect(normalizeIdentityAudience(42)).toBe('internal');
      expect(normalizeIdentityAudience({})).toBe('internal');
    });
  });

  describe('buildInspectSelfWorkQueue', () => {
    const dissolution: readonly DissolutionGapLike[] = [
      { surface: 'alpha', status: 'silent' },
      { surface: 'beta', status: 'dissolved' },
      { surface: 'gamma', status: 'partial' },
      { surface: 'delta', status: 'silent' },
    ];

    it('preserves gaps first, then silent dissolves, then partial emits', () => {
      expect(buildInspectSelfWorkQueue(['gap_a', 'gap_b'], dissolution)).toEqual([
        'gap_a',
        'gap_b',
        'dissolve_surface:alpha',
        'dissolve_surface:delta',
        'emit_canonical_events:gamma',
      ]);
    });

    it('returns just the gaps when nothing in dissolution needs work', () => {
      expect(buildInspectSelfWorkQueue(['x'], [{ surface: 'beta', status: 'dissolved' }])).toEqual([
        'x',
      ]);
    });

    it('returns an empty queue when both inputs are empty', () => {
      expect(buildInspectSelfWorkQueue([], [])).toEqual([]);
    });
  });

  describe('selectSilentSurfaces', () => {
    it('returns surfaces that are not yet dissolved', () => {
      const dissolution: readonly DissolutionGapLike[] = [
        { surface: 'alpha', status: 'silent' },
        { surface: 'beta', status: 'dissolved' },
        { surface: 'gamma', status: 'partial' },
      ];
      expect(selectSilentSurfaces(dissolution)).toEqual(['alpha', 'gamma']);
    });

    it('returns empty when every surface has dissolved', () => {
      expect(
        selectSilentSurfaces([
          { surface: 'alpha', status: 'dissolved' },
          { surface: 'beta', status: 'dissolved' },
        ]),
      ).toEqual([]);
    });

    it('returns empty for an empty input', () => {
      expect(selectSilentSurfaces([])).toEqual([]);
    });
  });
});
