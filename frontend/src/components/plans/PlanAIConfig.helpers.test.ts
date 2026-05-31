import { describe, it, expect } from 'vitest';
import {
  AI_CONFIG_SUMMARY_LABELS,
  type AIConfigState,
  buildAIConfigSummary,
  buildAIConfigSummaryItems,
  computeAIConfigCompleteness,
  parseSiblingPlansResponse,
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

describe('parseSiblingPlansResponse', () => {
  it('returns [] for non-array input', () => {
    expect(parseSiblingPlansResponse(null, 'p1')).toEqual([]);
    expect(parseSiblingPlansResponse(undefined, 'p1')).toEqual([]);
    expect(parseSiblingPlansResponse('not-array', 'p1')).toEqual([]);
    expect(parseSiblingPlansResponse({ id: 'p1' }, 'p1')).toEqual([]);
  });

  it('filters out the current plan id', () => {
    const out = parseSiblingPlansResponse(
      [
        { id: 'p1', name: 'Plano A' },
        { id: 'p2', name: 'Plano B' },
      ],
      'p1',
    );
    expect(out).toEqual([{ id: 'p2', name: 'Plano B' }]);
  });

  it('falls back through name -> title -> "Plano <id>"', () => {
    const out = parseSiblingPlansResponse(
      [
        { id: 'a', name: 'Premium' },
        { id: 'b', title: 'Starter' },
        { id: 'c' },
      ],
      'self',
    );
    expect(out).toEqual([
      { id: 'a', name: 'Premium' },
      { id: 'b', name: 'Starter' },
      { id: 'c', name: 'Plano c' },
    ]);
  });

  it('drops rows missing a string id', () => {
    const out = parseSiblingPlansResponse(
      [{ id: 'ok', name: 'Plano OK' }, { name: 'no-id' }, null, undefined],
      'self',
    );
    expect(out).toEqual([{ id: 'ok', name: 'Plano OK' }]);
  });
});

describe('buildAIConfigSummaryItems', () => {
  function completenessOf(overrides: Partial<{ [k: string]: boolean | number }> = {}) {
    return {
      s1Complete: false,
      s1Partial: false,
      s2Complete: false,
      s2Partial: false,
      s3Complete: false,
      s3Partial: false,
      s4Complete: false,
      s4Partial: false,
      s5Complete: false,
      s5Partial: false,
      s6Complete: false,
      s7Complete: false,
      s7Partial: false,
      activeObjections: 0,
      totalArgs: 0,
      ...overrides,
    } as ReturnType<typeof computeAIConfigCompleteness>;
  }

  it('emits exactly the seven labelled rows in canonical order', () => {
    const items = buildAIConfigSummaryItems(completenessOf());
    expect(items.map((i) => i.label)).toEqual([
      'Perfil',
      'Posição',
      'Objeções',
      'Argumentos',
      'Up/Down',
      'Comportamento',
      'Técnico',
    ]);
    expect(AI_CONFIG_SUMMARY_LABELS).toHaveLength(items.length);
  });

  it('forces the Comportamento row to partial=true regardless of input', () => {
    const items = buildAIConfigSummaryItems(completenessOf({ s6Complete: false }));
    const comportamento = items.find((i) => i.label === 'Comportamento');
    expect(comportamento?.partial).toBe(true);
  });

  it('propagates each section flag to the matching row', () => {
    const items = buildAIConfigSummaryItems(
      completenessOf({
        s1Complete: true,
        s1Partial: true,
        s4Complete: true,
        s4Partial: true,
        s7Complete: true,
        s7Partial: true,
      }),
    );
    expect(items.find((i) => i.label === 'Perfil')).toEqual({
      label: 'Perfil',
      complete: true,
      partial: true,
    });
    expect(items.find((i) => i.label === 'Argumentos')).toEqual({
      label: 'Argumentos',
      complete: true,
      partial: true,
    });
    expect(items.find((i) => i.label === 'Técnico')).toEqual({
      label: 'Técnico',
      complete: true,
      partial: true,
    });
  });
});
