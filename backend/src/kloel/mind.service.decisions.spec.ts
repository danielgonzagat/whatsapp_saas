import { MindService } from './mind.service';

function buildService(policy: unknown, cases?: unknown): MindService {
  return new MindService(
    { since: jest.fn().mockResolvedValue([]) } as never,
    { sweepExpired: jest.fn().mockResolvedValue(0) } as never,
    { list: jest.fn() } as never,
    policy as never,
    {
      recordFailure: jest.fn(),
      recordSuccess: jest.fn(),
      tryAcquireTickLease: jest.fn().mockResolvedValue(true),
      releaseTickLease: jest.fn().mockResolvedValue(undefined),
      watermark: jest.fn(async (_workspaceId: string, fallback: Date) => fallback),
    } as never,
    { process: jest.fn() } as never,
    (cases ?? { similar: jest.fn().mockResolvedValue([]) }) as never,
  );
}

describe('MindService decision delegation', () => {
  describe('resolveAudioVsText', () => {
    it('delegates to policy.choose with audio_vs_text decision type', async () => {
      const policy = {
        choose: jest.fn().mockResolvedValue({
          chosen: 'text',
          decision: {
            candidates: [{ beliefMean: 0.72 }],
            fallbackActive: false,
          },
        }),
        harness: jest.fn(),
      };

      const result = await buildService(policy).resolveAudioVsText('ws-1', 'whatsapp', 0.05);

      expect(policy.choose).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-1',
          decisionType: 'audio_vs_text',
          baseline: 'text',
          options: expect.arrayContaining([
            expect.objectContaining({ action: 'audio' }),
            expect.objectContaining({ action: 'text' }),
          ]),
        }),
      );
      expect(result.choice).toBe('text');
      expect(result.confidence).toBe(0.72);
      expect(result.fallback).toBe(false);
    });

    it('defaults to audio when audioRatio >= 0.2 on whatsapp', async () => {
      const policy = {
        choose: jest.fn().mockResolvedValue({
          chosen: 'audio',
          decision: {
            candidates: [{ beliefMean: 0.55 }],
            fallbackActive: false,
          },
        }),
        harness: jest.fn(),
      };

      const result = await buildService(policy).resolveAudioVsText('ws-1', 'whatsapp', 0.25);

      expect(policy.choose).toHaveBeenCalledWith(expect.objectContaining({ baseline: 'audio' }));
      expect(result.choice).toBe('audio');
    });
  });

  describe('resolveTone', () => {
    it('delegates to policy.choose with tom decision type and 9 tone options', async () => {
      const policy = {
        choose: jest.fn().mockResolvedValue({
          chosen: 'FRIENDLY',
          decision: {
            candidates: [{ beliefMean: 0.68 }],
            fallbackActive: false,
          },
        }),
        harness: jest.fn(),
      };

      const result = await buildService(policy).resolveTone('ws-1', 'whatsapp', 0.5, 0.2);

      expect(policy.choose).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-1',
          decisionType: 'tom',
          baseline: 'FRIENDLY',
          options: expect.arrayContaining([
            expect.objectContaining({ action: 'DIRECT' }),
            expect.objectContaining({ action: 'CONSULTIVE' }),
            expect.objectContaining({ action: 'FRIENDLY' }),
            expect.objectContaining({ action: 'CASUAL' }),
            expect.objectContaining({ action: 'EMPATHETIC' }),
            expect.objectContaining({ action: 'EDUCATIVE' }),
            expect.objectContaining({ action: 'URGENT' }),
            expect.objectContaining({ action: 'TECHNICAL' }),
            expect.objectContaining({ action: 'AGGRESSIVE' }),
          ]),
        }),
      );
      expect(result.tone).toBe('FRIENDLY');
      expect(result.confidence).toBe(0.68);
      expect(result.fallback).toBe(false);
    });

    it('defaults to CONSULTIVE when soldRate >= 0.15', async () => {
      const policy = {
        choose: jest.fn().mockResolvedValue({
          chosen: 'CONSULTIVE',
          decision: {
            candidates: [{ beliefMean: 0.6 }],
            fallbackActive: false,
          },
        }),
        harness: jest.fn(),
      };

      await buildService(policy).resolveTone('ws-1', 'email', 0.1, 0.2);

      expect(policy.choose).toHaveBeenCalledWith(
        expect.objectContaining({ baseline: 'CONSULTIVE' }),
      );
    });

    it('passes segment to policy context when provided', async () => {
      const policy = {
        choose: jest.fn().mockResolvedValue({
          chosen: 'DIRECT',
          decision: {
            candidates: [{ beliefMean: 0.5 }],
            fallbackActive: true,
          },
        }),
        harness: jest.fn(),
      };

      const result = await buildService(policy).resolveTone(
        'ws-1',
        'whatsapp',
        0.2,
        0.05,
        'premium',
      );

      expect(policy.choose).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({ segment: 'premium' }),
        }),
      );
      expect(result.fallback).toBe(true);
    });
  });

  describe('resolveMessageFormat', () => {
    it('delegates to policy.choose with message_format decision type', async () => {
      const policy = {
        choose: jest.fn().mockResolvedValue({
          chosen: 'text',
          decision: {
            candidates: [{ beliefMean: 0.7 }],
            fallbackActive: false,
          },
        }),
        harness: jest.fn(),
      };

      const result = await buildService(policy).resolveMessageFormat('ws-1', 'whatsapp', 'lead', [
        'text',
        'audio',
      ]);

      expect(policy.choose).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-1',
          decisionType: 'message_format',
          baseline: 'audio',
          options: expect.arrayContaining([
            expect.objectContaining({ action: 'text' }),
            expect.objectContaining({ action: 'audio' }),
          ]),
        }),
      );
      expect(result.format).toBe('text');
      expect(result.confidence).toBe(0.7);
    });
  });

  describe('resolveObjectionResponse', () => {
    it('delegates to policy.choose with objection_response decision type', async () => {
      const policy = {
        choose: jest.fn().mockResolvedValue({
          chosen: 'social_proof',
          decision: {
            candidates: [{ beliefMean: 0.63 }],
            fallbackActive: false,
          },
        }),
        harness: jest.fn(),
      };

      const result = await buildService(policy).resolveObjectionResponse(
        'ws-1',
        'instagram',
        'confianca',
        'over_300',
        'produto-1',
      );

      expect(policy.choose).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-1',
          decisionType: 'objection_response',
          baseline: 'social_proof',
          options: expect.arrayContaining([
            expect.objectContaining({ action: 'value_focus' }),
            expect.objectContaining({ action: 'social_proof' }),
            expect.objectContaining({ action: 'guarantee' }),
          ]),
        }),
      );
      expect(result.strategy).toBe('social_proof');
      expect(result.confidence).toBe(0.63);
    });
  });

  describe('resolveCoupon', () => {
    it('delegates to policy.choose with coupon_offer decision type', async () => {
      const policy = {
        choose: jest.fn().mockResolvedValue({
          chosen: 'no_coupon',
          decision: {
            candidates: [{ beliefMean: 0.82 }],
            fallbackActive: false,
          },
        }),
        harness: jest.fn(),
      };

      const result = await buildService(policy).resolveCoupon('ws-1', 'over_300', 0.08);

      expect(policy.choose).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-1',
          decisionType: 'coupon_offer',
          baseline: 'coupon_10',
          options: expect.arrayContaining([
            expect.objectContaining({ action: 'no_coupon' }),
            expect.objectContaining({ action: 'coupon_5' }),
            expect.objectContaining({ action: 'coupon_10' }),
            expect.objectContaining({ action: 'human_negotiate' }),
          ]),
        }),
      );
      expect(result.action).toBe('no_coupon');
      expect(result.confidence).toBe(0.82);
      expect(result.fallback).toBe(false);
    });

    it('defaults to no_coupon when priceBand is not over_300', async () => {
      const policy = {
        choose: jest.fn().mockResolvedValue({
          chosen: 'no_coupon',
          decision: {
            candidates: [{ beliefMean: 0.9 }],
            fallbackActive: false,
          },
        }),
        harness: jest.fn(),
      };

      await buildService(policy).resolveCoupon('ws-1', 'under_100', 0.05);

      expect(policy.choose).toHaveBeenCalledWith(
        expect.objectContaining({ baseline: 'no_coupon' }),
      );
    });

    it('defaults to coupon_10 when high price and low soldRate', async () => {
      const policy = {
        choose: jest.fn().mockResolvedValue({
          chosen: 'coupon_10',
          decision: {
            candidates: [{ beliefMean: 0.45 }],
            fallbackActive: false,
          },
        }),
        harness: jest.fn(),
      };

      await buildService(policy).resolveCoupon('ws-1', 'over_500', 0.05);

      expect(policy.choose).toHaveBeenCalledWith(
        expect.objectContaining({ baseline: 'coupon_10' }),
      );
    });

    it('passes segment to policy context when provided', async () => {
      const policy = {
        choose: jest.fn().mockResolvedValue({
          chosen: 'coupon_10',
          decision: {
            candidates: [{ beliefMean: 0.55 }],
            fallbackActive: false,
          },
        }),
        harness: jest.fn(),
      };

      await buildService(policy).resolveCoupon('ws-1', 'over_300', 0.08, 'premium');

      expect(policy.choose).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({ segment: 'premium', priceBand: 'over_300' }),
        }),
      );
    });
  });
});
