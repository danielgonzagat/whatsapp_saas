import { describe, it, expect, vi } from 'vitest';
import {
  type AIConfigState,
  assignBoolean,
  assignNumber,
  assignRecordString,
  assignString,
  assignStringArray,
  buildAIConfigPayload,
  buildAIConfigSummary,
  computeAIConfigCompleteness,
  isProductsSwrKey,
  toggleListValue,
} from './PlanAIConfig.helpers';

function baseState(overrides: Partial<AIConfigState> = {}): AIConfigState {
  return {
    planId: 'plan-1',
    genders: ['Todos'],
    ages: ['25-34'],
    moments: [],
    knowledge: 'INFORMED',
    buyingPower: 'COST_BENEFIT',
    problem: 'desc',
    tier: 'MAIN',
    whenOffer: ['always'],
    differentiators: ['support'],
    scarcity: 'NONE',
    objectionStates: {},
    socialProof: ['reviews'],
    socialProofValues: { reviews: '1000' },
    guarantee: ['7days'],
    guaranteeValues: {},
    benefits: ['fast'],
    benefitsValues: {},
    urgencyArgs: [],
    urgencyValues: {},
    upsellEnabled: false,
    upsellTargetPlan: '',
    upsellWhen: [],
    upsellArgument: '',
    downsellEnabled: false,
    downsellTargetPlan: '',
    downsellWhen: [],
    downsellArgument: '',
    tone: 'CONSULTIVE',
    persistence: 3,
    messageLimit: 10,
    followUpHours: '24',
    followUpMax: '3',
    hasTechInfo: false,
    usageMode: '',
    duration: '',
    contraindications: [],
    expectedResults: '',
    ...overrides,
  };
}

describe('assignString / assignNumber / assignBoolean', () => {
  it('only invokes setter when the type matches', () => {
    const setS = vi.fn();
    assignString({ k: 'ok' }, 'k', setS);
    assignString({ k: 42 }, 'k', setS);
    expect(setS).toHaveBeenCalledTimes(1);
    expect(setS).toHaveBeenCalledWith('ok');

    const setN = vi.fn();
    assignNumber({ k: 1 }, 'k', setN);
    assignNumber({ k: '1' }, 'k', setN);
    expect(setN).toHaveBeenCalledTimes(1);
    expect(setN).toHaveBeenCalledWith(1);

    const setB = vi.fn();
    assignBoolean({ k: true }, 'k', setB);
    assignBoolean({ k: 'true' }, 'k', setB);
    expect(setB).toHaveBeenCalledTimes(1);
    expect(setB).toHaveBeenCalledWith(true);
  });
});

describe('assignStringArray / assignRecordString', () => {
  it('forwards arrays only when value is an array', () => {
    const set = vi.fn();
    assignStringArray({ k: ['a'] }, 'k', set);
    assignStringArray({ k: 'no' }, 'k', set);
    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith(['a']);
  });

  it('forwards records only when value is a non-null object', () => {
    const set = vi.fn();
    assignRecordString({ k: { a: 'b' } }, 'k', set);
    assignRecordString({ k: null }, 'k', set);
    assignRecordString({ k: 'no' }, 'k', set);
    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith({ a: 'b' });
  });
});

describe('toggleListValue', () => {
  it('adds an item when absent', () => {
    expect(toggleListValue(['a'], 'b')).toEqual(['a', 'b']);
  });
  it('removes an item when present', () => {
    expect(toggleListValue(['a', 'b'], 'a')).toEqual(['b']);
  });
  it('does not mutate the input list', () => {
    const src = ['a'];
    toggleListValue(src, 'b');
    expect(src).toEqual(['a']);
  });
});

describe('isProductsSwrKey', () => {
  it('returns true for /products… string keys', () => {
    expect(isProductsSwrKey('/products')).toBe(true);
    expect(isProductsSwrKey('/products/123')).toBe(true);
  });
  it('returns false for non-string or unrelated keys', () => {
    expect(isProductsSwrKey('/other')).toBe(false);
    expect(isProductsSwrKey(42)).toBe(false);
    expect(isProductsSwrKey(null)).toBe(false);
    expect(isProductsSwrKey(undefined)).toBe(false);
  });
});

describe('buildAIConfigPayload', () => {
  it('serializes every state field with planId at the root', () => {
    const payload = buildAIConfigPayload(
      baseState({ planId: 'pln-x', moments: ['m1'], expectedResults: 'res' }),
    );
    expect(payload.planId).toBe('pln-x');
    expect(payload.moments).toEqual(['m1']);
    expect(payload.expectedResults).toBe('res');
  });

  it('passes through every documented field', () => {
    const payload = buildAIConfigPayload(baseState());
    const expectedKeys = [
      'planId',
      'genders',
      'ages',
      'moments',
      'knowledge',
      'buyingPower',
      'problem',
      'tier',
      'whenOffer',
      'differentiators',
      'scarcity',
      'objectionStates',
      'socialProof',
      'socialProofValues',
      'guarantee',
      'guaranteeValues',
      'benefits',
      'benefitsValues',
      'urgencyArgs',
      'urgencyValues',
      'upsellEnabled',
      'upsellTargetPlan',
      'upsellWhen',
      'upsellArgument',
      'downsellEnabled',
      'downsellTargetPlan',
      'downsellWhen',
      'downsellArgument',
      'tone',
      'persistence',
      'messageLimit',
      'followUpHours',
      'followUpMax',
      'hasTechInfo',
      'usageMode',
      'duration',
      'contraindications',
      'expectedResults',
    ];
    for (const key of expectedKeys) {
      expect(payload).toHaveProperty(key);
    }
  });
});

describe('computeAIConfigCompleteness', () => {
  it('reports s1 complete when genders+ages+problem are set', () => {
    const r = computeAIConfigCompleteness(baseState());
    expect(r.s1Complete).toBe(true);
    expect(r.s1Partial).toBe(true);
  });

  it('reports s1 partial only when one of genders/ages is set', () => {
    const r = computeAIConfigCompleteness(baseState({ problem: '', ages: [] }));
    expect(r.s1Complete).toBe(false);
    expect(r.s1Partial).toBe(true);
  });

  it('counts active objections and flags s3 thresholds', () => {
    const objs = Object.fromEntries(
      ['a', 'b', 'c', 'd', 'e'].map((id) => [id, { enabled: true, response: '' }]),
    );
    const r = computeAIConfigCompleteness(baseState({ objectionStates: objs }));
    expect(r.activeObjections).toBe(5);
    expect(r.s3Complete).toBe(true);
    expect(r.s3Partial).toBe(true);
  });

  it('sums totalArgs across the four argument arrays', () => {
    const r = computeAIConfigCompleteness(
      baseState({
        socialProof: ['a', 'b'],
        guarantee: ['c'],
        benefits: ['d'],
        urgencyArgs: ['e', 'f'],
      }),
    );
    expect(r.totalArgs).toBe(6);
  });

  it('treats both upsell/downsell disabled as s5 complete', () => {
    const r = computeAIConfigCompleteness(baseState());
    expect(r.s5Complete).toBe(true);
    expect(r.s5Partial).toBe(false);
  });

  it('requires a target plan when upsell is enabled', () => {
    const partial = computeAIConfigCompleteness(
      baseState({ upsellEnabled: true, upsellTargetPlan: '' }),
    );
    expect(partial.s5Complete).toBe(false);
    expect(partial.s5Partial).toBe(true);
    const complete = computeAIConfigCompleteness(
      baseState({ upsellEnabled: true, upsellTargetPlan: 'pl-2' }),
    );
    expect(complete.s5Complete).toBe(true);
  });

  it('only marks s7 complete when techInfo+usageMode+contraindications all present', () => {
    const empty = computeAIConfigCompleteness(baseState({ hasTechInfo: false }));
    expect(empty.s7Complete).toBe(false);
    expect(empty.s7Partial).toBe(false);

    const partial = computeAIConfigCompleteness(
      baseState({ hasTechInfo: true, usageMode: '', contraindications: [] }),
    );
    expect(partial.s7Complete).toBe(false);
    expect(partial.s7Partial).toBe(true);

    const complete = computeAIConfigCompleteness(
      baseState({ hasTechInfo: true, usageMode: 'topical', contraindications: ['none'] }),
    );
    expect(complete.s7Complete).toBe(true);
  });
});

describe('buildAIConfigSummary', () => {
  it('renders ∞ when messageLimit is 0 / falsy', () => {
    const s = buildAIConfigSummary({
      tone: 'CONSULTIVE',
      persistence: 3,
      messageLimit: 0,
      activeObjections: 2,
      totalArgs: 4,
      genders: ['Todos'],
      ages: ['25-34'],
      tier: '',
    });
    expect(s).toContain('Limite: ∞ msgs');
    expect(s).toContain('Objeções ativas: 2/10');
    expect(s).toContain('Argumentos: 4');
  });

  it('omits the tier suffix when tier is empty', () => {
    const s = buildAIConfigSummary({
      tone: 'CONSULTIVE',
      persistence: 3,
      messageLimit: 10,
      activeObjections: 0,
      totalArgs: 0,
      genders: ['Todos'],
      ages: ['25-34'],
      tier: '',
    });
    expect(s).not.toContain('Plano');
  });

  it('includes the tier label when tier is set', () => {
    const s = buildAIConfigSummary({
      tone: 'CONSULTIVE',
      persistence: 3,
      messageLimit: 10,
      activeObjections: 0,
      totalArgs: 0,
      genders: ['Todos'],
      ages: ['25-34'],
      tier: 'MAIN',
    });
    expect(s).toContain('Plano');
  });
});
