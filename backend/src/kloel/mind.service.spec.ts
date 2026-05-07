import { MindService } from './mind.service';

describe('MindService', () => {
  it('runs perceive-predict-surprise-update loop for message events', async () => {
    const perception = {
      since: jest.fn().mockResolvedValue([
        {
          workspaceId: 'ws-1',
          kind: 'message.sent',
          subject: 'contact:1',
          payload: { messageType: 'AUDIO', channel: 'whatsapp' },
          occurredAt: new Date('2026-05-07T20:00:00.000Z'),
        },
        {
          workspaceId: 'ws-1',
          kind: 'message.received',
          subject: 'contact:1',
          payload: {},
          occurredAt: new Date('2026-05-07T20:10:00.000Z'),
        },
      ]),
    };
    const predictor = {
      predictReply: jest.fn().mockResolvedValue({}),
    };
    const surprise = {
      resolveBinary: jest.fn().mockResolvedValue(0.22),
      sweepExpired: jest.fn().mockResolvedValue(0),
    };
    const policy = {
      harness: jest.fn(),
      resolveOpenForSubject: jest.fn().mockResolvedValue(1),
      sweepExpiredOutcomes: jest.fn().mockResolvedValue(0),
    };
    const service = new MindService(
      perception as never,
      predictor as never,
      surprise as never,
      { list: jest.fn() } as never,
      policy as never,
    );
    const expectedHour = new Date('2026-05-07T20:00:00.000Z').getHours();

    const tick = await service.tick('ws-1');

    expect(tick.perceived).toBe(2);
    expect(tick.predicted).toBe(1);
    expect(tick.resolved).toBe(2);
    expect(tick.beliefsUpdated).toBe(1);
    expect(policy.resolveOpenForSubject).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      subject: 'contact:1',
      decisionType: 'followup_timing',
      outcome: 1,
    });
    expect(predictor.predictReply).toHaveBeenCalledWith(
      {
        workspaceId: 'ws-1',
        subject: 'contact:1',
        features: { channel: 'whatsapp', hour: expectedHour, template: 'audio' },
      },
      24 * 3600,
    );
  });

  it('preserves instagram channel — does not turn instagram into whatsapp', async () => {
    const perception = {
      since: jest.fn().mockResolvedValue([
        {
          workspaceId: 'ws-1',
          kind: 'message.sent',
          subject: 'contact:2',
          payload: { messageType: 'TEXT', channel: 'instagram' },
          occurredAt: new Date('2026-05-07T15:00:00.000Z'),
        },
      ]),
    };
    const predictor = {
      predictReply: jest.fn().mockResolvedValue({}),
    };
    const surprise = {
      resolveBinary: jest.fn().mockResolvedValue(0),
      sweepExpired: jest.fn().mockResolvedValue(0),
    };
    const policy = {
      harness: jest.fn(),
      sweepExpiredOutcomes: jest.fn().mockResolvedValue(0),
    };
    const service = new MindService(
      perception as never,
      predictor as never,
      surprise as never,
      { list: jest.fn() } as never,
      policy as never,
    );
    const expectedHour = new Date('2026-05-07T15:00:00.000Z').getHours();

    await service.tick('ws-1');

    expect(predictor.predictReply).toHaveBeenCalledWith(
      {
        workspaceId: 'ws-1',
        subject: 'contact:2',
        features: { channel: 'instagram', hour: expectedHour, template: 'text' },
      },
      24 * 3600,
    );
  });

  it('uses unknown channel when event payload has no channel field', async () => {
    const perception = {
      since: jest.fn().mockResolvedValue([
        {
          workspaceId: 'ws-1',
          kind: 'message.sent',
          subject: 'contact:3',
          payload: { messageType: 'TEXT' },
          occurredAt: new Date('2026-05-07T10:00:00.000Z'),
        },
      ]),
    };
    const predictor = {
      predictReply: jest.fn().mockResolvedValue({}),
    };
    const surprise = {
      resolveBinary: jest.fn().mockResolvedValue(0),
      sweepExpired: jest.fn().mockResolvedValue(0),
    };
    const policy = {
      harness: jest.fn(),
      sweepExpiredOutcomes: jest.fn().mockResolvedValue(0),
    };
    const service = new MindService(
      perception as never,
      predictor as never,
      surprise as never,
      { list: jest.fn() } as never,
      policy as never,
    );
    const expectedHour = new Date('2026-05-07T10:00:00.000Z').getHours();

    await service.tick('ws-1');

    expect(predictor.predictReply).toHaveBeenCalledWith(
      {
        workspaceId: 'ws-1',
        subject: 'contact:3',
        features: { channel: 'unknown', hour: expectedHour, template: 'text' },
      },
      24 * 3600,
    );
  });

  it('skips concurrent tick for same workspace', async () => {
    const perception = {
      since: jest.fn().mockResolvedValue([]),
    };
    const surprise = {
      sweepExpired: jest.fn().mockResolvedValue(0),
    };
    const policy = {
      sweepExpiredOutcomes: jest.fn().mockResolvedValue(0),
    };
    const service = new MindService(
      perception as never,
      {} as never,
      surprise as never,
      { list: jest.fn() } as never,
      policy as never,
    );

    const [first, second] = await Promise.all([service.tick('ws-1'), service.tick('ws-1')]);

    expect(first.perceived).toBe(0);
    expect(second.perceived).toBe(0);
    expect(perception.since).toHaveBeenCalledTimes(1);
  });

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
      const service = new MindService(
        { since: jest.fn().mockResolvedValue([]) } as never,
        {} as never,
        { sweepExpired: jest.fn().mockResolvedValue(0) } as never,
        { list: jest.fn() } as never,
        policy as never,
      );

      const result = await service.resolveAudioVsText('ws-1', 'whatsapp', 0.05);

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
      const service = new MindService(
        { since: jest.fn().mockResolvedValue([]) } as never,
        {} as never,
        { sweepExpired: jest.fn().mockResolvedValue(0) } as never,
        { list: jest.fn() } as never,
        policy as never,
      );

      const result = await service.resolveAudioVsText('ws-1', 'whatsapp', 0.25);

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
      const service = new MindService(
        { since: jest.fn().mockResolvedValue([]) } as never,
        {} as never,
        { sweepExpired: jest.fn().mockResolvedValue(0) } as never,
        { list: jest.fn() } as never,
        policy as never,
      );

      const result = await service.resolveTone('ws-1', 'whatsapp', 0.5, 0.2);

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
      const service = new MindService(
        { since: jest.fn().mockResolvedValue([]) } as never,
        {} as never,
        { sweepExpired: jest.fn().mockResolvedValue(0) } as never,
        { list: jest.fn() } as never,
        policy as never,
      );

      await service.resolveTone('ws-1', 'email', 0.1, 0.2);

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
      const service = new MindService(
        { since: jest.fn().mockResolvedValue([]) } as never,
        {} as never,
        { sweepExpired: jest.fn().mockResolvedValue(0) } as never,
        { list: jest.fn() } as never,
        policy as never,
      );

      const result = await service.resolveTone('ws-1', 'whatsapp', 0.2, 0.05, 'premium');

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
      const service = new MindService(
        { since: jest.fn().mockResolvedValue([]) } as never,
        {} as never,
        { sweepExpired: jest.fn().mockResolvedValue(0) } as never,
        { list: jest.fn() } as never,
        policy as never,
      );

      const result = await service.resolveCoupon('ws-1', 'over_300', 0.08);

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
      const service = new MindService(
        { since: jest.fn().mockResolvedValue([]) } as never,
        {} as never,
        { sweepExpired: jest.fn().mockResolvedValue(0) } as never,
        { list: jest.fn() } as never,
        policy as never,
      );

      await service.resolveCoupon('ws-1', 'under_100', 0.05);

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
      const service = new MindService(
        { since: jest.fn().mockResolvedValue([]) } as never,
        {} as never,
        { sweepExpired: jest.fn().mockResolvedValue(0) } as never,
        { list: jest.fn() } as never,
        policy as never,
      );

      await service.resolveCoupon('ws-1', 'over_500', 0.05);

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
      const service = new MindService(
        { since: jest.fn().mockResolvedValue([]) } as never,
        {} as never,
        { sweepExpired: jest.fn().mockResolvedValue(0) } as never,
        { list: jest.fn() } as never,
        policy as never,
      );

      await service.resolveCoupon('ws-1', 'over_300', 0.08, 'premium');

      expect(policy.choose).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({ segment: 'premium', priceBand: 'over_300' }),
        }),
      );
    });
  });

  it('predicts conversion for checkout.pending events', async () => {
    const perception = {
      since: jest.fn().mockResolvedValue([
        {
          workspaceId: 'ws-1',
          kind: 'checkout.pending',
          subject: 'order:1',
          payload: { priceBand: '100_499', utmSource: 'google' },
          occurredAt: new Date('2026-05-07T15:00:00.000Z'),
        },
      ]),
    };
    const predictor = {
      predictConversion: jest.fn().mockResolvedValue({}),
    };
    const surprise = {
      resolveBinary: jest.fn().mockResolvedValue(0),
      sweepExpired: jest.fn().mockResolvedValue(0),
    };
    const policy = {
      harness: jest.fn(),
      sweepExpiredOutcomes: jest.fn().mockResolvedValue(0),
    };
    const service = new MindService(
      perception as never,
      predictor as never,
      surprise as never,
      { list: jest.fn() } as never,
      policy as never,
    );
    const expectedHour = new Date('2026-05-07T15:00:00.000Z').getHours();

    const tick = await service.tick('ws-1');

    expect(tick.predicted).toBe(1);
    expect(predictor.predictConversion).toHaveBeenCalledWith(
      {
        workspaceId: 'ws-1',
        subject: 'order:1',
        features: {
          channel: 'checkout',
          hour: expectedHour,
          price_band: '100_499',
          segment: 'google',
        },
      },
      48 * 3600,
    );
  });
});
