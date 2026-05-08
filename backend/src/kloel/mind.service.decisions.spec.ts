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

  describe('resolveCoupon', () => {
    it('delegates to policy.choose with cupom decision type', async () => {
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
          decisionType: 'cupom',
          baseline: 'offer_coupon',
          options: expect.arrayContaining([
            expect.objectContaining({ action: 'offer_coupon' }),
            expect.objectContaining({ action: 'no_coupon' }),
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

    it('defaults to offer_coupon when high price and low soldRate', async () => {
      const policy = {
        choose: jest.fn().mockResolvedValue({
          chosen: 'offer_coupon',
          decision: {
            candidates: [{ beliefMean: 0.45 }],
            fallbackActive: false,
          },
        }),
        harness: jest.fn(),
      };

      await buildService(policy).resolveCoupon('ws-1', 'over_500', 0.05);

      expect(policy.choose).toHaveBeenCalledWith(
        expect.objectContaining({ baseline: 'offer_coupon' }),
      );
    });

    it('passes segment to policy context when provided', async () => {
      const policy = {
        choose: jest.fn().mockResolvedValue({
          chosen: 'offer_coupon',
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

  describe('resolveHumanTransfer', () => {
    it('delegates to policy.choose with human_transfer decision type and 4 options', async () => {
      const policy = {
        choose: jest.fn().mockResolvedValue({
          chosen: 'continue_ai',
          decision: {
            candidates: [{ beliefMean: 0.75 }],
            fallbackActive: false,
          },
        }),
        harness: jest.fn(),
      };

      const result = await buildService(policy).resolveHumanTransfer(
        'ws-1',
        'whatsapp',
        'price_objection',
        0.3,
      );

      expect(policy.choose).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-1',
          decisionType: 'human_transfer',
          baseline: 'continue_ai',
          options: expect.arrayContaining([
            expect.objectContaining({ action: 'continue_ai' }),
            expect.objectContaining({ action: 'transfer_now' }),
            expect.objectContaining({ action: 'transfer_after_next_reply' }),
            expect.objectContaining({ action: 'pause_wait' }),
          ]),
        }),
      );
      expect(result.action).toBe('continue_ai');
      expect(result.confidence).toBe(0.75);
      expect(result.fallback).toBe(false);
    });

    it('defaults to transfer_now when ticketRisk >= 0.7', async () => {
      const policy = {
        choose: jest.fn().mockResolvedValue({
          chosen: 'transfer_now',
          decision: {
            candidates: [{ beliefMean: 0.88 }],
            fallbackActive: false,
          },
        }),
        harness: jest.fn(),
      };

      await buildService(policy).resolveHumanTransfer('ws-1', 'instagram', 'urgent', 0.9);

      expect(policy.choose).toHaveBeenCalledWith(
        expect.objectContaining({ baseline: 'transfer_now' }),
      );
    });

    it('defaults to transfer_after_next_reply when ticketRisk >= 0.4', async () => {
      const policy = {
        choose: jest.fn().mockResolvedValue({
          chosen: 'transfer_after_next_reply',
          decision: {
            candidates: [{ beliefMean: 0.62 }],
            fallbackActive: false,
          },
        }),
        harness: jest.fn(),
      };

      await buildService(policy).resolveHumanTransfer('ws-1', 'email', 'question', 0.5);

      expect(policy.choose).toHaveBeenCalledWith(
        expect.objectContaining({ baseline: 'transfer_after_next_reply' }),
      );
    });

    it('passes escalationInProgress and humanAvailable to context', async () => {
      const policy = {
        choose: jest.fn().mockResolvedValue({
          chosen: 'transfer_now',
          decision: {
            candidates: [{ beliefMean: 0.7 }],
            fallbackActive: false,
          },
        }),
        harness: jest.fn(),
      };

      await buildService(policy).resolveHumanTransfer('ws-1', 'whatsapp', 'complaint', 0.8, {
        escalationInProgress: true,
        humanAvailable: true,
      });

      expect(policy.choose).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({
            escalationInProgress: true,
            humanAvailable: true,
          }),
        }),
      );
    });
  });

  describe('resolveChannelChoice', () => {
    it('delegates to policy.choose with channel_choice decision type and dynamic options', async () => {
      const policy = {
        choose: jest.fn().mockResolvedValue({
          chosen: 'whatsapp',
          decision: {
            candidates: [{ beliefMean: 0.82 }],
            fallbackActive: false,
          },
        }),
        harness: jest.fn(),
      };

      const result = await buildService(policy).resolveChannelChoice(
        'ws-1',
        ['whatsapp', 'email'],
        'premium',
        14,
        'sale',
      );

      expect(policy.choose).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-1',
          decisionType: 'channel_choice',
          baseline: 'whatsapp',
          options: expect.arrayContaining([
            expect.objectContaining({ action: 'whatsapp' }),
            expect.objectContaining({ action: 'email' }),
          ]),
        }),
      );
      expect(result.channel).toBe('whatsapp');
      expect(result.confidence).toBe(0.82);
      expect(result.fallback).toBe(false);
    });

    it('defaults to first priority channel when available', async () => {
      const policy = {
        choose: jest.fn().mockResolvedValue({
          chosen: 'whatsapp',
          decision: {
            candidates: [{ beliefMean: 0.7 }],
            fallbackActive: false,
          },
        }),
        harness: jest.fn(),
      };

      await buildService(policy).resolveChannelChoice('ws-1', ['email', 'whatsapp', 'sms']);

      expect(policy.choose).toHaveBeenCalledWith(expect.objectContaining({ baseline: 'whatsapp' }));
    });

    it('falls back to first in list when priority channels are absent', async () => {
      const policy = {
        choose: jest.fn().mockResolvedValue({
          chosen: 'tiktok',
          decision: {
            candidates: [{ beliefMean: 0.4 }],
            fallbackActive: true,
          },
        }),
        harness: jest.fn(),
      };

      await buildService(policy).resolveChannelChoice('ws-1', ['tiktok']);

      expect(policy.choose).toHaveBeenCalledWith(expect.objectContaining({ baseline: 'tiktok' }));
    });

    it('passes segment, hour, concept to context', async () => {
      const policy = {
        choose: jest.fn().mockResolvedValue({
          chosen: 'instagram',
          decision: {
            candidates: [{ beliefMean: 0.65 }],
            fallbackActive: false,
          },
        }),
        harness: jest.fn(),
      };

      await buildService(policy).resolveChannelChoice(
        'ws-1',
        ['instagram', 'whatsapp'],
        'new_lead',
        20,
        'price_objection',
      );

      expect(policy.choose).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({
            segment: 'new_lead',
            hour: 20,
            concept: 'price_objection',
          }),
        }),
      );
    });
  });

  describe('resolveProductOffer', () => {
    it('delegates to policy.choose with product_offer decision type and 5 options', async () => {
      const policy = {
        choose: jest.fn().mockResolvedValue({
          chosen: 'top_seller',
          decision: {
            candidates: [{ beliefMean: 0.78 }],
            fallbackActive: false,
          },
        }),
        harness: jest.fn(),
      };

      const result = await buildService(policy).resolveProductOffer(
        'ws-1',
        'new_lead',
        'hot_lead',
        'under_100',
      );

      expect(policy.choose).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-1',
          decisionType: 'product_offer',
          baseline: 'entry_product',
          options: expect.arrayContaining([
            expect.objectContaining({ action: 'top_seller' }),
            expect.objectContaining({ action: 'highest_margin' }),
            expect.objectContaining({ action: 'entry_product' }),
            expect.objectContaining({ action: 'premium_product' }),
            expect.objectContaining({ action: 'upsell' }),
          ]),
        }),
      );
      expect(result.offer).toBe('top_seller');
      expect(result.confidence).toBe(0.78);
      expect(result.fallback).toBe(false);
    });

    it('defaults to premium_product for premium segment', async () => {
      const policy = {
        choose: jest.fn().mockResolvedValue({
          chosen: 'premium_product',
          decision: {
            candidates: [{ beliefMean: 0.85 }],
            fallbackActive: false,
          },
        }),
        harness: jest.fn(),
      };

      await buildService(policy).resolveProductOffer('ws-1', 'premium', 'hot_lead', 'over_500');

      expect(policy.choose).toHaveBeenCalledWith(
        expect.objectContaining({ baseline: 'premium_product' }),
      );
    });

    it('defaults to highest_margin for high price bands', async () => {
      const policy = {
        choose: jest.fn().mockResolvedValue({
          chosen: 'highest_margin',
          decision: {
            candidates: [{ beliefMean: 0.62 }],
            fallbackActive: false,
          },
        }),
        harness: jest.fn(),
      };

      await buildService(policy).resolveProductOffer('ws-1', 'regular', 'sale', 'over_1000');

      expect(policy.choose).toHaveBeenCalledWith(
        expect.objectContaining({ baseline: 'highest_margin' }),
      );
    });

    it('passes lastPurchase to context when provided', async () => {
      const policy = {
        choose: jest.fn().mockResolvedValue({
          chosen: 'upsell',
          decision: {
            candidates: [{ beliefMean: 0.55 }],
            fallbackActive: false,
          },
        }),
        harness: jest.fn(),
      };

      await buildService(policy).resolveProductOffer(
        'ws-1',
        'regular',
        'sale',
        'under_100',
        'A1B2C3',
      );

      expect(policy.choose).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({ lastPurchase: 'A1B2C3' }),
        }),
      );
    });
  });

  describe('resolveBroadcastWindow', () => {
    it('delegates to policy.choose with broadcast_window decision type and 4 window options', async () => {
      const policy = {
        choose: jest.fn().mockResolvedValue({
          chosen: 'tomorrow_9h',
          decision: {
            candidates: [{ beliefMean: 0.68 }],
            fallbackActive: false,
          },
        }),
        harness: jest.fn(),
      };

      const result = await buildService(policy).resolveBroadcastWindow(
        'ws-1',
        'whatsapp',
        'regular',
        'tuesday',
        0.2,
      );

      expect(policy.choose).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-1',
          decisionType: 'broadcast_window',
          baseline: 'tomorrow_9h',
          options: expect.arrayContaining([
            expect.objectContaining({ action: 'now' }),
            expect.objectContaining({ action: 'tonight_20h' }),
            expect.objectContaining({ action: 'tomorrow_9h' }),
            expect.objectContaining({ action: 'friday_21h' }),
          ]),
        }),
      );
      expect(result.window).toBe('tomorrow_9h');
      expect(result.confidence).toBe(0.68);
      expect(result.fallback).toBe(false);
    });

    it('defaults to pause when fatigue is high (>= 0.8)', async () => {
      const policy = {
        choose: jest.fn().mockResolvedValue({
          chosen: 'pause',
          decision: {
            candidates: [{ beliefMean: 0.9 }],
            fallbackActive: false,
          },
        }),
        harness: jest.fn(),
      };

      await buildService(policy).resolveBroadcastWindow(
        'ws-1',
        'whatsapp',
        'regular',
        'monday',
        0.9,
      );

      expect(policy.choose).toHaveBeenCalledWith(expect.objectContaining({ baseline: 'pause' }));
    });

    it('includes pause option when fatigue is high', async () => {
      const policy = {
        choose: jest.fn().mockResolvedValue({
          chosen: 'pause',
          decision: {
            candidates: [{ beliefMean: 0.9 }],
            fallbackActive: false,
          },
        }),
        harness: jest.fn(),
      };

      await buildService(policy).resolveBroadcastWindow(
        'ws-1',
        'instagram',
        'cold',
        'friday',
        0.85,
      );

      expect(policy.choose).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.arrayContaining([expect.objectContaining({ action: 'pause' })]),
        }),
      );
    });
  });

  describe('resolveAdAlertAction', () => {
    it('delegates to policy.choose with ad_alert_action decision type and 5 options', async () => {
      const policy = {
        choose: jest.fn().mockResolvedValue({
          chosen: 'alert_only',
          decision: {
            candidates: [{ beliefMean: 0.72 }],
            fallbackActive: false,
          },
        }),
        harness: jest.fn(),
      };

      const result = await buildService(policy).resolveAdAlertAction(
        'ws-1',
        'roas',
        24,
        'normal',
        'camp-summer',
      );

      expect(policy.choose).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-1',
          decisionType: 'ad_alert_action',
          baseline: 'alert_only',
          options: expect.arrayContaining([
            expect.objectContaining({ action: 'alert_only' }),
            expect.objectContaining({ action: 'suggest_pause' }),
            expect.objectContaining({ action: 'suggest_budget_down' }),
            expect.objectContaining({ action: 'suggest_creative' }),
            expect.objectContaining({ action: 'ignore' }),
          ]),
        }),
      );
      expect(result.action).toBe('alert_only');
      expect(result.confidence).toBe(0.72);
      expect(result.fallback).toBe(false);
    });

    it('defaults to suggest_pause when threshold is critical', async () => {
      const policy = {
        choose: jest.fn().mockResolvedValue({
          chosen: 'suggest_pause',
          decision: {
            candidates: [{ beliefMean: 0.91 }],
            fallbackActive: false,
          },
        }),
        harness: jest.fn(),
      };

      await buildService(policy).resolveAdAlertAction('ws-1', 'cpc', 12, 'critical');

      expect(policy.choose).toHaveBeenCalledWith(
        expect.objectContaining({ baseline: 'suggest_pause' }),
      );
    });

    it('defaults to suggest_budget_down when threshold is low', async () => {
      const policy = {
        choose: jest.fn().mockResolvedValue({
          chosen: 'suggest_budget_down',
          decision: {
            candidates: [{ beliefMean: 0.66 }],
            fallbackActive: false,
          },
        }),
        harness: jest.fn(),
      };

      await buildService(policy).resolveAdAlertAction('ws-1', 'roas', 24, 'low');

      expect(policy.choose).toHaveBeenCalledWith(
        expect.objectContaining({ baseline: 'suggest_budget_down' }),
      );
    });

    it('passes campaign name to context', async () => {
      const policy = {
        choose: jest.fn().mockResolvedValue({
          chosen: 'ignore',
          decision: {
            candidates: [{ beliefMean: 0.3 }],
            fallbackActive: true,
          },
        }),
        harness: jest.fn(),
      };

      await buildService(policy).resolveAdAlertAction(
        'ws-1',
        'ctr',
        48,
        'normal',
        'camp-black-friday',
      );

      expect(policy.choose).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({ campaign: 'camp-black-friday' }),
        }),
      );
    });
  });
});
