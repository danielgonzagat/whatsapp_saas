import { MindService } from './mind.service';

describe('MindService', () => {
  it('runs perceive-predict-surprise-update loop for message events', async () => {
    const perception = {
      since: jest.fn().mockResolvedValue([
        {
          workspaceId: 'ws-1',
          kind: 'message.sent',
          subject: 'contact:1',
          payload: { messageType: 'AUDIO' },
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
