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
  function build(opts: { ringCapacity?: number } = {}) {
    return new SpineEmitterService(new ValenceTaggerService(), opts);
  }

  it('stamps eventId, timestamp, environment on every emit', () => {
    const svc = build();
    const env = svc.emit(baseInput);
    expect(env.eventId).toMatch(/^evt_/);
    expect(env.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(['dev', 'staging', 'prod']).toContain(env.provenance.environment);
  });

  it('preserves explicit valence', () => {
    const svc = build();
    const env = svc.emit({
      ...baseInput,
      eventName: 'commerce.payment.approved',
      valence: 'ambiguous',
    });
    expect(env.valence).toBe('ambiguous');
  });

  it('auto-tags terminal valence via ValenceTaggerService', () => {
    const svc = build();
    const env = svc.emit({
      ...baseInput,
      eventName: 'commerce.payment.refunded',
    });
    expect(env.valence).toBe('negative');
  });

  it('does not tag non-terminal events', () => {
    const svc = build();
    const env = svc.emit({ ...baseInput, eventName: 'commerce.lead.contacted' });
    expect(env.valence).toBeUndefined();
  });

  it('ring buffer overwrites oldest when capacity exceeded', () => {
    const svc = build({ ringCapacity: 64 });
    for (let i = 0; i < 100; i += 1) {
      svc.emit({ ...baseInput, eventName: `commerce.lead.replied`, payload: { i } });
    }
    const recent = svc.recentEvents();
    expect(recent).toHaveLength(64);
    expect(recent[0]?.payload?.['i']).toBe(36);
    expect(recent[63]?.payload?.['i']).toBe(99);
  });

  it('recentEvents(limit) returns the tail slice', () => {
    const svc = build();
    for (let i = 0; i < 10; i += 1) svc.emit({ ...baseInput, payload: { i } });
    const last3 = svc.recentEvents(3);
    expect(last3).toHaveLength(3);
    expect(last3[2]?.payload?.['i']).toBe(9);
  });

  it('subscribe + unsubscribe receive new events', () => {
    const svc = build();
    const seen: string[] = [];
    const off = svc.subscribe((e) => seen.push(e.eventName));
    svc.emit({ ...baseInput, eventName: 'commerce.lead.replied' });
    svc.emit({ ...baseInput, eventName: 'commerce.payment.approved' });
    off();
    svc.emit({ ...baseInput, eventName: 'commerce.crm.deal_won' });
    expect(seen).toEqual(['commerce.lead.replied', 'commerce.payment.approved']);
  });

  it('subscriber throw does not break emission or other subscribers', () => {
    const svc = build();
    svc.subscribe(() => {
      throw new Error('boom');
    });
    const seen: string[] = [];
    svc.subscribe((e) => seen.push(e.eventName));
    expect(() => svc.emit(baseInput)).not.toThrow();
    expect(seen).toEqual(['commerce.lead.replied']);
  });

  it('recentEventsAsRef adapts envelopes for MIND consumption', () => {
    const svc = build();
    svc.emit({
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

  it('stats reports buffered/capacity/subscribers', () => {
    const svc = build({ ringCapacity: 100 });
    expect(svc.stats()).toEqual({ buffered: 0, capacity: 100, subscribers: 0 });
    svc.subscribe(() => {});
    svc.emit(baseInput);
    expect(svc.stats()).toEqual({ buffered: 1, capacity: 100, subscribers: 1 });
  });

  it('different correlationIds produce distinct envelopes', () => {
    const svc = build();
    svc.emit({ ...baseInput, correlationId: 'a' });
    svc.emit({ ...baseInput, correlationId: 'b' });
    const recent = svc.recentEvents();
    expect(recent).toHaveLength(2);
    expect(recent[0]?.correlationId).toBe('a');
    expect(recent[1]?.correlationId).toBe('b');
    expect(recent[0]?.eventId).not.toBe(recent[1]?.eventId);
  });
});
