import {
  GENESIS_EVENT,
  GENESIS_EVENT_ID,
  ORGANISM_CANONICAL_NAME,
  canonicalizeJson,
  computeGenesisHash,
  verifyGenesisEvent,
} from './genesis-event';

/**
 * UTP-LINEAGE-006 — Spec de imutabilidade do Genesis.
 *
 * Validates PCI.3 §2.2 — origin-immutability.
 */
describe('GENESIS_EVENT immutability and verification', () => {
  it('exposes the canonical name literally as "Kloel"', () => {
    expect(ORGANISM_CANONICAL_NAME).toBe('Kloel');
    expect(GENESIS_EVENT.payload.canonicalName).toBe('Kloel');
  });

  it('uses the canonical genesis eventId', () => {
    expect(GENESIS_EVENT.eventId).toBe(GENESIS_EVENT_ID);
    expect(GENESIS_EVENT.eventName).toBe('lineage.genesis');
  });

  it('declares the immutable fields exactly as PCI.3 specifies', () => {
    expect(GENESIS_EVENT.payload.inviolable).toEqual([
      'canonicalName',
      'etymology',
      'origin',
      'steward',
      'inviolable',
    ]);
  });

  it('declares the evolvable fields exactly as PCI.3 specifies', () => {
    expect(GENESIS_EVENT.payload.evolvable).toEqual([
      'capabilities',
      'memory',
      'valence',
      'beliefs',
      'operationalState',
    ]);
  });

  it('preserves the canonical etymology — kléos + El + synthesis', () => {
    expect(GENESIS_EVENT.payload.etymology.greek.word).toBe('kléos');
    expect(GENESIS_EVENT.payload.etymology.hebrew.word).toBe('El');
    expect(GENESIS_EVENT.payload.etymology.synthesis).toMatch(/renome.*sob fundamento maior/i);
  });

  it('records steward posture as preserver, not dictator', () => {
    expect(GENESIS_EVENT.payload.steward.role).toBe('humano-mordomo');
    expect(GENESIS_EVENT.payload.steward.posture).toMatch(/preservador.*não.*ditador/i);
  });

  it('rejects mutation of canonicalName via Object.assign', () => {
    expect(() => {
      Object.assign(GENESIS_EVENT.payload, { canonicalName: 'NotKloel' });
    }).toThrow(TypeError);
    expect(GENESIS_EVENT.payload.canonicalName).toBe('Kloel');
  });

  it('rejects mutation of etymology via direct property write', () => {
    expect(() => {
      const mutable = GENESIS_EVENT.payload.etymology as {
        greek: { word: string };
      };
      mutable.greek.word = 'kudos';
    }).toThrow(TypeError);
    expect(GENESIS_EVENT.payload.etymology.greek.word).toBe('kléos');
  });

  it('rejects mutation of origin via direct property write', () => {
    expect(() => {
      const mutable = GENESIS_EVENT.payload.origin as { inception: string };
      mutable.inception = '1999-01-01';
    }).toThrow(TypeError);
    expect(GENESIS_EVENT.payload.origin.inception).toBe('2026-05-13');
  });

  it('rejects mutation of inviolable list via Array.push', () => {
    expect(() => {
      const mutable = GENESIS_EVENT.payload.inviolable as string[];
      mutable.push('new-field');
    }).toThrow(TypeError);
    expect(GENESIS_EVENT.payload.inviolable).toHaveLength(5);
  });

  it('hash is deterministic for the canonical payload', () => {
    const recomputed = computeGenesisHash(GENESIS_EVENT.payload);
    expect(recomputed).toBe(GENESIS_EVENT.hash);
    expect(recomputed).toMatch(/^[a-f0-9]{64}$/);
  });

  it('hash differs when payload is mutated (defense in depth)', () => {
    const tamperedPayload = {
      ...GENESIS_EVENT.payload,
      canonicalName: 'NotKloel',
    };
    const tamperedHash = computeGenesisHash(tamperedPayload as never);
    expect(tamperedHash).not.toBe(GENESIS_EVENT.hash);
  });

  it('verifyGenesisEvent accepts the canonical event', () => {
    expect(verifyGenesisEvent(GENESIS_EVENT)).toBe(true);
  });

  it('verifyGenesisEvent rejects an event with mutated payload', () => {
    const tampered = {
      ...GENESIS_EVENT,
      payload: { ...GENESIS_EVENT.payload, canonicalName: 'NotKloel' },
    };
    expect(verifyGenesisEvent(tampered)).toBe(false);
  });

  it('verifyGenesisEvent rejects an event with wrong eventId', () => {
    const tampered = { ...GENESIS_EVENT, eventId: 'fake' as never };
    expect(verifyGenesisEvent(tampered)).toBe(false);
  });

  it('verifyGenesisEvent rejects an event with wrong eventName', () => {
    const tampered = { ...GENESIS_EVENT, eventName: 'lineage.something_else' as never };
    expect(verifyGenesisEvent(tampered)).toBe(false);
  });

  it('verifyGenesisEvent rejects null and primitives', () => {
    expect(verifyGenesisEvent(null)).toBe(false);
    expect(verifyGenesisEvent(undefined)).toBe(false);
    expect(verifyGenesisEvent('Kloel')).toBe(false);
    expect(verifyGenesisEvent(42)).toBe(false);
  });
});

describe('canonicalizeJson — JCS subset', () => {
  it('orders keys lexicographically', () => {
    const obj = { b: 1, a: 2, c: 3 };
    expect(canonicalizeJson(obj)).toBe('{"a":2,"b":1,"c":3}');
  });

  it('canonicalizes nested objects recursively', () => {
    const obj = { z: { y: 1, x: 2 }, a: 3 };
    expect(canonicalizeJson(obj)).toBe('{"a":3,"z":{"x":2,"y":1}}');
  });

  it('preserves array order (positional semantics)', () => {
    const arr = [3, 1, 2];
    expect(canonicalizeJson(arr)).toBe('[3,1,2]');
  });

  it('handles primitives directly', () => {
    expect(canonicalizeJson('x')).toBe('"x"');
    expect(canonicalizeJson(42)).toBe('42');
    expect(canonicalizeJson(true)).toBe('true');
    expect(canonicalizeJson(null)).toBe('null');
  });
});
