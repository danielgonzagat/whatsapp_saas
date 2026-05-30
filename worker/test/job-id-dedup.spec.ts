import { describe, it, expect } from 'vitest';
import { buildQueueJobId, hashQueuePayload } from '../job-id';

/**
 * These tests lock the BullMQ dedup contract for outbound-producing queue jobs:
 * a jobId built from STABLE business identifiers must be identical across
 * re-runs/retries (so BullMQ collapses duplicates), and must differ only when a
 * real business input changes. The regression they guard against is producers
 * mixing `Date.now()` into the jobId, which silently defeats dedup and causes
 * duplicate WhatsApp sends / webhook dispatches on retry.
 */
describe('hashQueuePayload — deterministic dedup token', () => {
  it('is stable for identical inputs (enables BullMQ retry dedup)', () => {
    expect(hashQueuePayload('olá, qual o valor?')).toBe(hashQueuePayload('olá, qual o valor?'));
  });

  it('normalizes whitespace and case so cosmetic differences still dedup', () => {
    expect(hashQueuePayload('  Olá   MUNDO  ')).toBe(hashQueuePayload('olá mundo'));
  });

  it('NFKC-normalizes equivalent unicode forms to the same token', () => {
    // 'á' as precomposed (U+00E1) vs decomposed (a + U+0301 combining acute)
    expect(hashQueuePayload('á')).toBe(hashQueuePayload('á'));
  });

  it('differs when the business content differs', () => {
    expect(hashQueuePayload('mensagem A')).not.toBe(hashQueuePayload('mensagem B'));
  });

  it('produces a fixed-length, queue-id-safe hex token', () => {
    const token = hashQueuePayload('arbitrary content here', 'extra', 42);
    expect(token).toMatch(/^[0-9a-f]{16}$/);
  });

  it('treats null/undefined/empty consistently', () => {
    expect(hashQueuePayload(undefined)).toBe(hashQueuePayload(''));
    expect(hashQueuePayload(null)).toBe(hashQueuePayload(''));
  });
});

describe('buildQueueJobId — stable outbound jobId derivation', () => {
  it('legacy-scanner: same (workspace, contact, triggerMessageId, message) → same jobId', () => {
    const make = () =>
      buildQueueJobId(
        'legacy-scanner',
        'ws_1',
        'contact_1',
        'msg_42',
        hashQueuePayload('Oi! Temos uma oferta pra você.'),
      );
    expect(make()).toBe(make());
  });

  it('legacy-scanner: a NEW conversation trigger (different lastMsg.id) yields a new jobId', () => {
    const a = buildQueueJobId(
      'legacy-scanner',
      'ws_1',
      'contact_1',
      'msg_42',
      hashQueuePayload('m'),
    );
    const b = buildQueueJobId(
      'legacy-scanner',
      'ws_1',
      'contact_1',
      'msg_99',
      hashQueuePayload('m'),
    );
    expect(a).not.toBe(b);
  });

  it('legacy-scanner: a different generated message yields a new jobId', () => {
    const a = buildQueueJobId(
      'legacy-scanner',
      'ws_1',
      'contact_1',
      'msg_42',
      hashQueuePayload('a'),
    );
    const b = buildQueueJobId(
      'legacy-scanner',
      'ws_1',
      'contact_1',
      'msg_42',
      hashQueuePayload('b'),
    );
    expect(a).not.toBe(b);
  });

  it('scan-contact: same triggering inbound message → same jobId (dedups re-fired handlers)', () => {
    const make = () =>
      buildQueueJobId('scan-contact', 'ws_1', 'contact_1', hashQueuePayload('quanto custa?'));
    expect(make()).toBe(make());
  });

  it('does NOT embed wall-clock time — two builds milliseconds apart are equal', async () => {
    const a = buildQueueJobId(
      'legacy-scanner',
      'ws_1',
      'contact_1',
      'msg_42',
      hashQueuePayload('x'),
    );
    await new Promise((r) => setTimeout(r, 5));
    const b = buildQueueJobId(
      'legacy-scanner',
      'ws_1',
      'contact_1',
      'msg_42',
      hashQueuePayload('x'),
    );
    expect(a).toBe(b);
  });
});
