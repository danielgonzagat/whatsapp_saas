import type { CaseMemoryLookup } from './mind-case-memory-decision.helper';
import type { MindPolicyService } from './mind-policy.service';
import {
  resolveAudioVsTextDecision,
  resolveCouponDecision,
  resolveToneDecision,
} from './mind-catalog-decision-resolvers';

function mockCases(rows: Array<Record<string, unknown>>): CaseMemoryLookup {
  return { similar: jest.fn().mockResolvedValue(rows) };
}

function mockPolicy(chosen: string, beliefMean = 0.7): MindPolicyService {
  return {
    choose: jest.fn().mockResolvedValue({
      chosen,
      decision: { candidates: [{ action: chosen, beliefMean }], fallbackActive: false },
    }),
  } as unknown as MindPolicyService;
}

describe('resolveAudioVsTextDecision with memory', () => {
  it('passes memory-based baseline to policy when memory returns an action', async () => {
    const cases = mockCases([
      { action: 'audio', similarity: 0.8, outcome: 1 },
      { action: 'audio', similarity: 0.7, outcome: 0.9 },
      { action: 'text', similarity: 0.3, outcome: 0.2 },
    ]);
    const policy = mockPolicy('audio');

    const result = await resolveAudioVsTextDecision(policy, cases, 'ws-1', 'whatsapp', 0.05);

    expect(policy.choose).toHaveBeenCalledWith(
      expect.objectContaining({ baseline: 'audio', decisionType: 'audio_vs_text' }),
    );
    expect(result.choice).toBe('audio');
  });

  it('falls back to resolveAudioBaseline when memory returns null', async () => {
    const cases = mockCases([]);
    const policy = mockPolicy('text');

    const result = await resolveAudioVsTextDecision(policy, cases, 'ws-1', 'email', 0.01);

    expect(policy.choose).toHaveBeenCalledWith(
      expect.objectContaining({ baseline: 'text', decisionType: 'audio_vs_text' }),
    );
    expect(result.choice).toBe('text');
  });

  it('falls back to audio baseline when audioRatio >= 0.2 and memory is empty', async () => {
    const cases = mockCases([]);
    const policy = mockPolicy('audio');

    const result = await resolveAudioVsTextDecision(policy, cases, 'ws-1', 'whatsapp', 0.25);

    expect(policy.choose).toHaveBeenCalledWith(
      expect.objectContaining({ baseline: 'audio', decisionType: 'audio_vs_text' }),
    );
    expect(result.choice).toBe('audio');
  });
});

describe('resolveToneDecision with memory', () => {
  it('passes memory-based baseline to policy with 9 tone options', async () => {
    const cases = mockCases([
      { action: 'FRIENDLY', similarity: 0.8, outcome: 1 },
      { action: 'FRIENDLY', similarity: 0.7, outcome: 0.9 },
      { action: 'DIRECT', similarity: 0.4, outcome: 0.3 },
    ]);
    const policy = mockPolicy('FRIENDLY');

    const result = await resolveToneDecision(policy, cases, 'ws-1', 'whatsapp', 0.5, 0.2);

    expect(policy.choose).toHaveBeenCalledWith(
      expect.objectContaining({ baseline: 'FRIENDLY', decisionType: 'tom' }),
    );
    expect(result.tone).toBe('FRIENDLY');
  });

  it('falls back to resolveToneBaseline when memory returns null', async () => {
    const cases = mockCases([]);
    const policy = mockPolicy('DIRECT');

    const result = await resolveToneDecision(policy, cases, 'ws-1', 'email', 0.1, 0.05);

    expect(policy.choose).toHaveBeenCalledWith(
      expect.objectContaining({ baseline: 'DIRECT', decisionType: 'tom' }),
    );
    expect(result.tone).toBe('DIRECT');
  });

  it('passes segment to memory and policy when provided', async () => {
    const cases = mockCases([
      { action: 'CONSULTIVE', similarity: 0.9, outcome: 1 },
      { action: 'CONSULTIVE', similarity: 0.8, outcome: 0.9 },
      { action: 'FRIENDLY', similarity: 0.5, outcome: 0.5 },
    ]);
    const policy = mockPolicy('CONSULTIVE');

    await resolveToneDecision(policy, cases, 'ws-1', 'whatsapp', 0.2, 0.15, 'premium');

    expect(cases.similar).toHaveBeenCalledWith(
      expect.objectContaining({
        features: expect.objectContaining({ channel: 'whatsapp', segment: 'premium' }),
        caseType: 'tom',
      }),
    );
    expect(policy.choose).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({ segment: 'premium' }),
      }),
    );
  });
});

describe('resolveCouponDecision with memory', () => {
  it('passes memory-based baseline to policy when memory returns an action', async () => {
    const cases = mockCases([
      { action: 'offer_coupon', similarity: 0.8, outcome: 1 },
      { action: 'offer_coupon', similarity: 0.7, outcome: 0.9 },
      { action: 'no_coupon', similarity: 0.3, outcome: 0.1 },
    ]);
    const policy = mockPolicy('offer_coupon');

    const result = await resolveCouponDecision(policy, cases, 'ws-1', 'over_500', 0.05);

    expect(policy.choose).toHaveBeenCalledWith(
      expect.objectContaining({ baseline: 'offer_coupon', decisionType: 'cupom' }),
    );
    expect(result.action).toBe('offer_coupon');
  });

  it('falls back to resolveCouponBaseline when memory returns null', async () => {
    const cases = mockCases([]);
    const policy = mockPolicy('no_coupon');

    const result = await resolveCouponDecision(policy, cases, 'ws-1', 'under_100', 0.05);

    expect(policy.choose).toHaveBeenCalledWith(
      expect.objectContaining({ baseline: 'no_coupon', decisionType: 'cupom' }),
    );
    expect(result.action).toBe('no_coupon');
  });

  it('passes segment to memory and policy context', async () => {
    const cases = mockCases([]);
    const policy = mockPolicy('no_coupon');

    await resolveCouponDecision(policy, cases, 'ws-1', 'over_300', 0.08, 'premium');

    expect(cases.similar).toHaveBeenCalledWith(
      expect.objectContaining({ features: expect.objectContaining({ segment: 'premium' }) }),
    );
    expect(policy.choose).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({ segment: 'premium' }),
      }),
    );
  });
});
