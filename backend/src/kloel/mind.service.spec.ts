import { MindService } from './mind.service';

function buildService(
  perception: unknown,
  predictor: unknown,
  surprise: unknown,
  policy: unknown,
): MindService {
  const state = {
    recordFailure: jest.fn(),
    recordSuccess: jest.fn(),
    watermark: jest.fn(async (_workspaceId: string, fallback: Date) => fallback),
  };
  const events = {
    process: jest.fn(async (event) => {
      let predicted = 0;
      let resolved = 0;
      let surpriseTotal = 0;
      let beliefsUpdated = 0;

      if (event.kind === 'message.sent') {
        await (predictor as { predictReply: jest.Mock }).predictReply(
          {
            workspaceId: event.workspaceId,
            subject: event.subject,
            features: {
              channel: event.payload.channel ?? 'unknown',
              hour: event.occurredAt.getHours(),
              template: String(event.payload.messageType ?? 'text').toLowerCase(),
            },
          },
          24 * 3600,
        );
        predicted += 1;
      }
      if (event.kind === 'message.received') {
        const value = await (surprise as { resolveBinary: jest.Mock }).resolveBinary();
        if (value > 0) {
          resolved += 1;
          beliefsUpdated += 1;
          surpriseTotal += value;
        }
        resolved += await (policy as { resolveOpenForSubject: jest.Mock }).resolveOpenForSubject({
          workspaceId: event.workspaceId,
          subject: event.subject,
          decisionType: 'followup_timing',
          outcome: 1,
        });
      }
      if (event.kind === 'checkout.pending') {
        await (predictor as { predictConversion: jest.Mock }).predictConversion(
          {
            workspaceId: event.workspaceId,
            subject: event.subject,
            features: {
              channel: 'checkout',
              hour: event.occurredAt.getHours(),
              price_band: event.payload.priceBand,
              segment: event.payload.utmSource,
            },
          },
          48 * 3600,
        );
        predicted += 1;
      }

      return { beliefsUpdated, predicted, resolved, surpriseTotal };
    }),
  };

  return new MindService(
    perception as never,
    surprise as never,
    { list: jest.fn() } as never,
    policy as never,
    {
      ...state,
      tryAcquireTickLease: jest.fn().mockResolvedValue(true),
      releaseTickLease: jest.fn().mockResolvedValue(undefined),
    } as never,
    events as never,
    { similar: jest.fn().mockResolvedValue([]) } as never,
  );
}

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
    const service = buildService(perception, predictor, surprise, policy);
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
    const service = buildService(perception, predictor, surprise, policy);
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
    const service = buildService(perception, predictor, surprise, policy);
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
    const service = buildService(perception, {}, surprise, policy);

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
    const service = buildService(perception, predictor, surprise, policy);
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
