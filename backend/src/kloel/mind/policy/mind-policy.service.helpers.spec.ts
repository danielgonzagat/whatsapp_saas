import type { MindActionCandidate, MindBelief, MindPolicyCalcStep } from '../../mind.types';
import type { MindPolicyHarnessResult, MindPolicyInput } from './mind-policy-calculation';
import {
  assembleChooseDecision,
  buildBaselineActionInput,
  buildConfirmWindowCutoff,
  buildHarnessSince,
  buildMixedBeliefDefault,
  buildMixedBeliefMixed,
  buildSweepCutoff,
  extractChooseDefaults,
  isPrismaUniqueConstraintError,
  MIND_POLICY_DEFAULT_CONFIRM_WINDOW_MINUTES,
  MIND_POLICY_DEFAULT_EPSILON,
  MIND_POLICY_DEFAULT_FALLBACK_MIN_SAMPLES,
  MIND_POLICY_DEFAULT_UTILITY_FAIL,
  MIND_POLICY_DEFAULT_UTILITY_SUCCESS,
  resolveConfirmWindowMinutes,
  shouldFallbackToBaseline,
  toResolvedPolicyRows,
  type MindPolicyArtifacts,
} from './mind-policy.service.helpers';

const baseInput: MindPolicyInput = {
  workspaceId: 'ws-1',
  subject: 'contact:1',
  decisionType: 'followup_timing',
  context: {},
  options: [{ action: 'a', predicate: 'P(reply)', context: {} }],
};

function makeBelief(overrides: Partial<MindBelief> = {}): MindBelief {
  return {
    mean: 0.5,
    variance: 0.1,
    samples: 0,
    ...overrides,
  } as MindBelief;
}

describe('mind-policy.service.helpers', () => {
  describe('extractChooseDefaults', () => {
    it('aplica defaults canonicos quando todos os campos estao ausentes', () => {
      const defaults = extractChooseDefaults(baseInput);
      expect(defaults.utilitySuccess).toBe(MIND_POLICY_DEFAULT_UTILITY_SUCCESS);
      expect(defaults.utilityFail).toBe(MIND_POLICY_DEFAULT_UTILITY_FAIL);
      expect(defaults.epsilon).toBe(MIND_POLICY_DEFAULT_EPSILON);
      expect(defaults.minSamples).toBe(MIND_POLICY_DEFAULT_FALLBACK_MIN_SAMPLES);
    });

    it('respeita valores explicitos do input em vez do default', () => {
      const defaults = extractChooseDefaults({
        ...baseInput,
        utilitySuccess: 2,
        utilityFail: -0.5,
        epsilon: 0.9,
        fallbackMinSamples: 5,
      });
      expect(defaults).toEqual({
        utilitySuccess: 2,
        utilityFail: -0.5,
        epsilon: 0.9,
        minSamples: 5,
      });
    });

    it('aceita zero como valor explicito (nao usa default ?? para 0)', () => {
      const defaults = extractChooseDefaults({
        ...baseInput,
        epsilon: 0,
        utilitySuccess: 0,
        utilityFail: 0,
        fallbackMinSamples: 0,
      });
      expect(defaults).toEqual({
        utilitySuccess: 0,
        utilityFail: 0,
        epsilon: 0,
        minSamples: 0,
      });
    });
  });

  describe('buildBaselineActionInput', () => {
    it('omite campos ausentes em vez de incluir undefined', () => {
      const out = buildBaselineActionInput(baseInput, undefined);
      expect('baseline' in out).toBe(false);
      expect('baselineActionQuiet' in out).toBe(false);
      expect('fallback' in out).toBe(false);
    });

    it('inclui apenas os campos definidos pelo caller', () => {
      const out = buildBaselineActionInput({ baseline: 'safe' }, 'last_resort');
      expect(out).toEqual({ baseline: 'safe', fallback: 'last_resort' });
    });

    it('inclui baselineActionQuiet quando fornecido', () => {
      const out = buildBaselineActionInput({ baselineActionQuiet: 'quiet' }, undefined);
      expect(out).toEqual({ baselineActionQuiet: 'quiet' });
    });

    it('inclui fallback quando string vazia (treated as defined)', () => {
      const out = buildBaselineActionInput({}, '');
      expect(out).toEqual({ fallback: '' });
    });
  });

  describe('assembleChooseDecision', () => {
    const winnerCandidate: MindActionCandidate = {
      action: 'a',
      baseEfe: -0.1,
      beliefMean: 0.5,
      beliefVariance: 0.1,
      economicScore: 0.05,
      pragmatic: 0.4,
      epistemic: 0.05,
      efe: -0.15,
      uncertaintyAtChoice: 0.1,
    };
    const calcStep: MindPolicyCalcStep = {
      action: 'a',
      baseEfe: -0.1,
      beliefMean: 0.5,
      beliefVariance: 0.1,
      economicScore: 0.05,
      pragmatic: 0.4,
      epistemic: 0.05,
      efe: -0.15,
      formula: 'EFE=-(P+E)-economicScore',
    };
    const artifacts: MindPolicyArtifacts = {
      candidates: [winnerCandidate],
      calcSteps: [calcStep],
    };

    it('anexa usedGlobalPrior e priorWeight ao decision construido', () => {
      const decision = assembleChooseDecision({
        artifacts,
        baselineAction: 'safe',
        epsilon: 0.5,
        policy: baseInput,
        utilityFail: -0.2,
        utilitySuccess: 1,
        usedGlobalPrior: true,
        maxPriorWeight: 0.42,
      });
      expect(decision.usedGlobalPrior).toBe(true);
      expect(decision.priorWeight).toBe(0.42);
      expect(decision.chosen).toBe('a');
      expect(decision.baseline).toBe('safe');
      expect(decision.baselineAction).toBe('safe');
      expect(decision.candidates).toHaveLength(1);
    });

    it('false/0 quando o mix global-prior nao foi usado', () => {
      const decision = assembleChooseDecision({
        artifacts,
        baselineAction: 'safe',
        epsilon: 0.5,
        policy: baseInput,
        utilityFail: -0.2,
        utilitySuccess: 1,
        usedGlobalPrior: false,
        maxPriorWeight: 0,
      });
      expect(decision.usedGlobalPrior).toBe(false);
      expect(decision.priorWeight).toBe(0);
    });
  });

  describe('buildMixedBeliefDefault / buildMixedBeliefMixed', () => {
    it('default copia o mean local com usedPrior=false', () => {
      const belief = makeBelief({ mean: 0.7, variance: 0.08, samples: 12 });
      const out = buildMixedBeliefDefault(belief);
      expect(out).toEqual({
        belief,
        mixedMean: 0.7,
        usedPrior: false,
        priorWeight: 0,
      });
    });

    it('mixed propaga mixedMean/priorWeight do mix com usedPrior=true', () => {
      const belief = makeBelief({ mean: 0.4, variance: 0.2, samples: 3 });
      const out = buildMixedBeliefMixed(belief, { mixedMean: 0.55, priorWeight: 0.7 });
      expect(out).toEqual({
        belief,
        mixedMean: 0.55,
        usedPrior: true,
        priorWeight: 0.7,
      });
    });
  });

  describe('toResolvedPolicyRows', () => {
    it('coalesca outcomeKey ausente para null', () => {
      const rows = [
        {
          id: 'p1',
          workspaceId: 'ws-1',
          subject: 'contact:1',
          decisionType: 'followup_timing',
          context: { channel: 'whatsapp' },
          chosen: 'a',
          baseline: 'safe',
          outcomeKey: null,
        },
      ];
      const out = toResolvedPolicyRows(rows, 1);
      expect(out).toHaveLength(1);
      expect(out[0]).toEqual({
        id: 'p1',
        workspaceId: 'ws-1',
        subject: 'contact:1',
        decisionType: 'followup_timing',
        context: { channel: 'whatsapp' },
        chosen: 'a',
        baseline: 'safe',
        outcomeKey: null,
        outcome: 1,
      });
    });

    it('preserva outcomeKey quando string nao-vazia', () => {
      const out = toResolvedPolicyRows(
        [
          {
            id: 'p2',
            workspaceId: 'ws-2',
            subject: 'contact:2',
            decisionType: 'autopilot_action',
            context: {},
            chosen: 'pause',
            baseline: 'continue',
            outcomeKey: 'msg:123',
          },
        ],
        0,
      );
      expect(out[0]?.outcomeKey).toBe('msg:123');
      expect(out[0]?.outcome).toBe(0);
    });

    it('estampa o mesmo outcome em todas as rows', () => {
      const out = toResolvedPolicyRows(
        [
          {
            id: 'p3',
            workspaceId: 'ws-3',
            subject: 's3',
            decisionType: 't',
            context: {},
            chosen: 'a',
            baseline: 'b',
            outcomeKey: null,
          },
          {
            id: 'p4',
            workspaceId: 'ws-3',
            subject: 's4',
            decisionType: 't',
            context: {},
            chosen: 'a',
            baseline: 'b',
            outcomeKey: null,
          },
        ],
        0.75,
      );
      expect(out.map((row) => row.outcome)).toEqual([0.75, 0.75]);
    });

    it('mantem array vazio em entrada vazia', () => {
      expect(toResolvedPolicyRows([], 1)).toEqual([]);
    });
  });

  describe('isPrismaUniqueConstraintError', () => {
    it('reconhece P2002 como unique constraint', () => {
      expect(isPrismaUniqueConstraintError({ code: 'P2002' })).toBe(true);
    });

    it('rejeita codigos diferentes', () => {
      expect(isPrismaUniqueConstraintError({ code: 'P2003' })).toBe(false);
      expect(isPrismaUniqueConstraintError({ code: 'p2002' })).toBe(false);
    });

    it('rejeita primitivos e null', () => {
      expect(isPrismaUniqueConstraintError(null)).toBe(false);
      expect(isPrismaUniqueConstraintError(undefined)).toBe(false);
      expect(isPrismaUniqueConstraintError('P2002')).toBe(false);
      expect(isPrismaUniqueConstraintError(42)).toBe(false);
    });

    it('rejeita objetos sem code', () => {
      expect(isPrismaUniqueConstraintError({})).toBe(false);
      expect(isPrismaUniqueConstraintError(new Error('boom'))).toBe(false);
    });
  });

  describe('shouldFallbackToBaseline', () => {
    it('repassa o resultado do predicado de calculation', () => {
      const harness: MindPolicyHarnessResult = {
        n: 31,
        mindMean: 0.4,
        baselineMean: 0.6,
        lift: -0.2,
        pZScore: -3,
      };
      const spy = jest.fn().mockReturnValue(true);
      const out = shouldFallbackToBaseline({
        harnessResult: harness,
        minSamples: 30,
        shouldUseBaselineFallback: spy,
      });
      expect(out).toBe(true);
      expect(spy).toHaveBeenCalledWith(harness, 30);
    });
  });

  describe('buildHarnessSince / buildSweepCutoff / buildConfirmWindowCutoff', () => {
    it('buildHarnessSince usa now explicito quando fornecido', () => {
      const ref = new Date('2026-01-15T00:00:00Z').getTime();
      const since = buildHarnessSince({ sinceDays: 14, now: ref });
      expect(since.getTime()).toBe(ref - 14 * 86400 * 1000);
    });

    it('buildSweepCutoff converte horas em ms', () => {
      const ref = new Date('2026-01-15T00:00:00Z').getTime();
      const cutoff = buildSweepCutoff({ maxAgeHours: 48, now: ref });
      expect(cutoff.getTime()).toBe(ref - 48 * 3600 * 1000);
    });

    it('buildConfirmWindowCutoff converte minutos em ms', () => {
      const ref = new Date('2026-01-15T00:00:00Z').getTime();
      const cutoff = buildConfirmWindowCutoff({ windowMinutes: 30, now: ref });
      expect(cutoff.getTime()).toBe(ref - 30 * 60 * 1000);
    });

    it('cai para Date.now() quando now nao e fornecido', () => {
      const before = Date.now();
      const since = buildHarnessSince({ sinceDays: 1 });
      const after = Date.now();
      expect(since.getTime()).toBeGreaterThanOrEqual(before - 86400 * 1000);
      expect(since.getTime()).toBeLessThanOrEqual(after - 86400 * 1000);
    });
  });

  describe('resolveConfirmWindowMinutes', () => {
    it('retorna o default quando undefined', () => {
      expect(resolveConfirmWindowMinutes(undefined)).toBe(
        MIND_POLICY_DEFAULT_CONFIRM_WINDOW_MINUTES,
      );
    });

    it('preserva valores explicitos', () => {
      expect(resolveConfirmWindowMinutes(15)).toBe(15);
      expect(resolveConfirmWindowMinutes(0)).toBe(0);
    });
  });
});
