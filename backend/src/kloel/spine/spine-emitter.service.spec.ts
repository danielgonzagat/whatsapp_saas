import { ValenceTaggerService } from '../mind/valence-tagger.service';
import { SpineEmitterService } from './spine-emitter.service';
import type { SpineEventInput } from './spine-event.types';

const baseInput: SpineEventInput = {
  eventName: 'commerce.lead.replied',
  workspaceId: 'wks_demo',
  entityRef: { entityType: 'lead', entityId: 'lead_1' },
  truthMode: 'observed',
  provenance: {
    source: 'production',
    processor: 'spec',
    processorVersion: '1.0.0',
    schemaVersion: '1.0.0',
  },
};

describe('SpineEmitterService', () => {
  function build(opts: { ringCapacity?: number } = {}, redis?: import('ioredis').Redis) {
    return new SpineEmitterService(new ValenceTaggerService(), opts, redis);
  }

  it('stamps eventId, timestamp, environment on every emit', async () => {
    const svc = build();
    const env = await svc.emit(baseInput);
    expect(env.eventId).toMatch(/^evt_/);
    expect(env.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(['dev', 'staging', 'prod']).toContain(env.provenance.environment);
  });

  it('preserves explicit valence', async () => {
    const svc = build();
    const env = await svc.emit({
      ...baseInput,
      eventName: 'commerce.payment.approved',
      valence: 'ambiguous',
    });
    expect(env.valence).toBe('ambiguous');
  });

  it('auto-tags terminal valence via ValenceTaggerService', async () => {
    const svc = build();
    const env = await svc.emit({
      ...baseInput,
      eventName: 'commerce.payment.refunded',
    });
    expect(env.valence).toBe('negative');
  });

  it('does not tag non-terminal events', async () => {
    const svc = build();
    const env = await svc.emit({ ...baseInput, eventName: 'commerce.lead.contacted' });
    expect(env.valence).toBeUndefined();
  });

  it('ring buffer overwrites oldest when capacity exceeded', async () => {
    const svc = build({ ringCapacity: 64 });
    for (let i = 0; i < 100; i += 1) {
      await svc.emit({ ...baseInput, eventName: `commerce.lead.replied`, payload: { i } });
    }
    const recent = svc.recentEvents();
    expect(recent).toHaveLength(64);
    expect(recent[0]?.payload?.['i']).toBe(36);
    expect(recent[63]?.payload?.['i']).toBe(99);
  });

  it('recentEvents(limit) returns the tail slice', async () => {
    const svc = build();
    for (let i = 0; i < 10; i += 1) await svc.emit({ ...baseInput, payload: { i } });
    const last3 = svc.recentEvents(3);
    expect(last3).toHaveLength(3);
    expect(last3[2]?.payload?.['i']).toBe(9);
  });

  it('subscribe + unsubscribe receive new events', async () => {
    const svc = build();
    const seen: string[] = [];
    const off = svc.subscribe((e) => seen.push(e.eventName));
    await svc.emit({ ...baseInput, eventName: 'commerce.lead.replied' });
    await svc.emit({ ...baseInput, eventName: 'commerce.payment.approved' });
    off();
    await svc.emit({ ...baseInput, eventName: 'commerce.crm.deal_won' });
    expect(seen).toEqual(['commerce.lead.replied', 'commerce.payment.approved']);
  });

  it('subscriber throw does not break emission or other subscribers', async () => {
    const svc = build();
    svc.subscribe(() => {
      throw new Error('boom');
    });
    const seen: string[] = [];
    svc.subscribe((e) => seen.push(e.eventName));
    await expect(svc.emit(baseInput)).resolves.toBeDefined();
    expect(seen).toEqual(['commerce.lead.replied']);
  });

  it('recentEventsAsRef adapts envelopes for MIND consumption', async () => {
    const svc = build();
    await svc.emit({
      ...baseInput,
      eventName: 'commerce.payment.approved',
      payload: { amountCents: 1000 },
      correlationId: 'c1',
    });
    const refs = svc.recentEventsAsRef();
    expect(refs).toHaveLength(1);
    expect(refs[0]?.eventName).toBe('commerce.payment.approved');
    expect(refs[0]?.valence).toBe('positive');
    expect(refs[0]?.correlationId).toBe('c1');
  });

  it('stats reports buffered/capacity/subscribers', async () => {
    const svc = build({ ringCapacity: 100 });
    expect(svc.stats()).toEqual({ buffered: 0, capacity: 100, subscribers: 0 });
    svc.subscribe(() => {});
    await svc.emit(baseInput);
    expect(svc.stats()).toEqual({ buffered: 1, capacity: 100, subscribers: 1 });
  });

  it('different correlationIds produce distinct envelopes', async () => {
    const svc = build();
    await svc.emit({ ...baseInput, correlationId: 'a' });
    await svc.emit({ ...baseInput, correlationId: 'b' });
    const recent = svc.recentEvents();
    expect(recent).toHaveLength(2);
    expect(recent[0]?.correlationId).toBe('a');
    expect(recent[1]?.correlationId).toBe('b');
    expect(recent[0]?.eventId).not.toBe(recent[1]?.eventId);
  });

  it('ringSize tracks buffered count', async () => {
    const svc = build({ ringCapacity: 5 });
    expect(svc.ringSize()).toBe(0);
    for (let i = 0; i < 3; i += 1) await svc.emit(baseInput);
    expect(svc.ringSize()).toBe(3);
  });

  // ── CIA Gap 5 — Redis Stream persistence ──

  describe('Redis Stream persistence', () => {
    const mockXadd = jest.fn().mockResolvedValue('1620000000000-0');
    const mockXrange = jest.fn().mockResolvedValue([]);
    const mockRedis = {
      xadd: mockXadd,
      xrange: mockXrange,
    } as unknown as import('ioredis').Redis;

    beforeEach(() => {
      mockXadd.mockClear();
      mockXrange.mockClear();
    });

    it('emit() writes envelope to Redis Stream with correct args', async () => {
      const svc = build({}, mockRedis);
      await svc.emit(baseInput);

      expect(mockXadd).toHaveBeenCalledTimes(1);
      const [key, maxlenArg, approxArg, maxlenVal, idArg, field, value] =
        mockXadd.mock.calls[0];
      expect(key).toBe('spine:events:wks_demo');
      expect(maxlenArg).toBe('MAXLEN');
      expect(approxArg).toBe('~');
      expect(maxlenVal).toBe(5000);
      expect(idArg).toBe('*');
      expect(field).toBe('event');
      const parsed = JSON.parse(value as string);
      expect(parsed.eventName).toBe('commerce.lead.replied');
      expect(parsed.workspaceId).toBe('wks_demo');
      expect(parsed.eventId).toMatch(/^evt_/);
    });

    it('emit() still writes to ring buffer alongside Redis', async () => {
      const svc = build({}, mockRedis);
      await svc.emit(baseInput);

      expect(svc.ringSize()).toBe(1);
      expect(mockXadd).toHaveBeenCalledTimes(1);
      expect(svc.recentEvents(1)[0]?.eventName).toBe('commerce.lead.replied');
    });

    it('emit() resolves even when Redis xadd rejects', async () => {
      mockXadd.mockRejectedValueOnce(new Error('connection refused'));
      const svc = build({}, mockRedis);

      const envelope = await svc.emit(baseInput);

      expect(envelope.eventId).toMatch(/^evt_/);
      expect(svc.ringSize()).toBe(1);
      expect(mockXadd).toHaveBeenCalledTimes(1);
    });

    it('emit() does not call xadd when workspaceId is undefined', async () => {
      const svc = build({}, mockRedis);
      await svc.emit({
        ...baseInput,
        workspaceId: undefined,
      });

      expect(mockXadd).not.toHaveBeenCalled();
      expect(svc.ringSize()).toBe(1);
    });

    it('emit() does not call xadd when redis is absent (no DI)', async () => {
      const svc = build();
      await svc.emit(baseInput);

      expect(svc.ringSize()).toBe(1);
      // No redis — no crash
    });

    it('replayFromStream calls xrange with correct key and defaults', async () => {
      mockXrange.mockResolvedValueOnce([
        ['1620000000000-0', ['event', JSON.stringify({ ...baseInput, eventId: 'evt_a' })]],
      ]);
      const svc = build({}, mockRedis);

      const events = await svc.replayFromStream('wks_demo');

      expect(mockXrange).toHaveBeenCalledWith('spine:events:wks_demo', '-', '+');
      expect(events).toHaveLength(1);
      expect(events[0]?.eventId).toBe('evt_a');
    });

    it('replayFromStream uses since as xrange start when provided', async () => {
      mockXrange.mockResolvedValueOnce([]);
      const svc = build({}, mockRedis);

      await svc.replayFromStream('wks_demo', '1620000000000-0');

      expect(mockXrange).toHaveBeenCalledWith(
        'spine:events:wks_demo',
        '1620000000000-0',
        '+',
      );
    });

    it('replayFromStream returns empty array when redis is absent', async () => {
      const svc = build();

      const events = await svc.replayFromStream('wks_demo');

      expect(events).toEqual([]);
    });

    it('replayFromStream returns empty array on xrange error', async () => {
      mockXrange.mockRejectedValueOnce(new Error('connection refused'));
      const svc = build({}, mockRedis);

      const events = await svc.replayFromStream('wks_demo');

      expect(events).toEqual([]);
      expect(mockXrange).toHaveBeenCalledTimes(1);
    });

    it('replayFromStream skips entries with missing event field', async () => {
      mockXrange.mockResolvedValueOnce([
        ['1620000000000-0', ['other', 'value']],
        ['1620000000001-0', ['event', JSON.stringify({ ...baseInput, eventId: 'evt_b' })]],
      ]);
      const svc = build({}, mockRedis);

      const events = await svc.replayFromStream('wks_demo');

      expect(events).toHaveLength(1);
      expect(events[0]?.eventId).toBe('evt_b');
    });
  });
});
