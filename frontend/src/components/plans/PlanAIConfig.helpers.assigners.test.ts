import { describe, it, expect, vi } from 'vitest';
import {
  type AIConfigState,
  assignBoolean,
  assignNumber,
  assignRecordString,
  assignString,
  assignStringArray,
  buildAIConfigPayload,
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
