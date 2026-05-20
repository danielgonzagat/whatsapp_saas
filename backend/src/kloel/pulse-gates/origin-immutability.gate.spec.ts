import {
  GENESIS_EVENT,
  ORGANISM_CANONICAL_NAME,
  computeGenesisHash,
  verifyGenesisEvent,
} from '../lineage/genesis-event';
import { makeOriginImmutabilityGate, OriginImmutabilityGate } from './origin-immutability.gate';
import { cloneGenesisPayload, gate, mockGuard } from './origin-immutability.gate.spec.helpers';

/** Test-only helper: read the gate's private `mode` field without a double cast. */
function extractMode(g: object): string {
  return (g as { mode: string }).mode;
}

/**
 * UTP-PULSE-005 — origin-immutability gate contract spec.
 *
 * Implements PCI.4 §3.6: Genesis Event was never rewritten.
 *
 * Covers >=20 scenarios:
 *   - Positive (PASS): compiled constant self-verifies, guard returns intact
 *   - Negative (FAIL): guard returns compromised (origin rewritten in ledger)
 *   - Negative (FAIL): self-check failures (hash mismatch, canonicalName mismatch, eventId mismatch)
 *   - Mode contract: both hard_fail and log_only
 *   - Edge cases: missing reason, evidence inspection
 */

// Because the gate reads GENESIS_EVENT directly from the module, rewriting
// the constant at test time is impractical (it's frozen). The self-check
// tests below exercise the logic indirectly by testing computeGenesisHash
// and verifyGenesisEvent in isolation — the gate delegates to these same
// functions. The guard.verify() path is fully testable with mocks.

// ─── Positive (PASS) scenarios ──────────────────────────────────────

describe('origin-immutability gate — PASS scenarios', () => {
  it('1. gate passes when LineageGuard returns intact (hard_fail mode)', async () => {
    const v = await gate('hard_fail').check();
    expect(v.status).toBe('PASS');
    expect(v.gateName).toBe('origin-immutability');
    expect(v.mode).toBe('hard_fail');
    expect(v.measuredBy).toBe('origin-immutability.gate');
  });

  it('2. gate passes when LineageGuard returns intact (log_only mode)', async () => {
    const v = await gate('log_only').check();
    expect(v.status).toBe('PASS');
    expect(v.mode).toBe('log_only');
  });

  it('3. default mode is hard_fail', () => {
    const g = makeOriginImmutabilityGate(mockGuard());
    // mode is private — verify through the STATIC DEFAULT_MODE
    expect(OriginImmutabilityGate.DEFAULT_MODE).toBe('hard_fail');
    expect(extractMode(g)).toBe('hard_fail');
  });

  it('4. gate name is origin-immutability', () => {
    const g = makeOriginImmutabilityGate(mockGuard());
    expect(g.name).toBe('origin-immutability');
  });

  it('5. PASS verdict includes measuredAt timestamp', async () => {
    const before = new Date().toISOString();
    const v = await gate().check();
    const after = new Date().toISOString();
    expect(v.measuredAt).toBeDefined();
    expect(v.measuredAt >= before && v.measuredAt <= after).toBe(true);
  });

  it('6. PASS when guard returns intact with many entries (non-trivial ledger)', async () => {
    const v = await gate('hard_fail', {
      status: 'intact',
      entryCount: 42,
      tailSequenceNumber: 42,
      tailHash: 'abc123',
      genesisHash: GENESIS_EVENT.hash,
    }).check();
    expect(v.status).toBe('PASS');
    expect(v.reason).toBeUndefined();
  });
});

// ─── Negative (FAIL) — guard returns compromised ────────────────────

describe('origin-immutability gate — FAIL (guard compromise)', () => {
  it('7. hard_fail: guard compromised with reason → FAIL', async () => {
    const v = await gate('hard_fail', {
      status: 'compromised',
      reason: 'entry 1 canonicalName is not "Kloel" — Genesis tampered',
    }).check();
    expect(v.status).toBe('FAIL');
    expect(v.mode).toBe('hard_fail');
    expect(v.reason).toBe('entry 1 canonicalName is not "Kloel" — Genesis tampered');
  });

  it('8. log_only: guard compromised with reason → FAIL (still fails, mode is log_only)', async () => {
    const v = await gate('log_only', {
      status: 'compromised',
      reason: 'entry 1 eventId mismatch',
    }).check();
    expect(v.status).toBe('FAIL');
    expect(v.mode).toBe('log_only');
    expect(v.reason).toBe('entry 1 eventId mismatch');
  });

  it('9. guard compromised without reason → FAIL with default fallback reason', async () => {
    const v = await gate('hard_fail', {
      status: 'compromised',
      // reason is undefined — gate should use fallback
    }).check();
    expect(v.status).toBe('FAIL');
    expect(v.reason).toBe('ledger-stored Genesis tampered');
  });

  it('10. guard compromised: empty ledger → FAIL', async () => {
    const v = await gate('hard_fail', {
      status: 'compromised',
      entryCount: 0,
      tailSequenceNumber: 0,
      tailHash: null,
      genesisHash: null,
      reason: 'ledger is empty',
    }).check();
    expect(v.status).toBe('FAIL');
    expect(v.reason).toBe('ledger is empty');
  });

  it('11. guard compromised: hash chain broken → FAIL', async () => {
    const v = await gate('hard_fail', {
      status: 'compromised',
      reason: 'hash mismatch at seq=3: stored=deadbeef… recomputed=cafebabe…',
      entryCount: 10,
      tailSequenceNumber: 10,
    }).check();
    expect(v.status).toBe('FAIL');
    expect(v.reason).toContain('hash mismatch');
  });

  it('12. guard compromised: sequence number gap → FAIL', async () => {
    const v = await gate('hard_fail', {
      status: 'compromised',
      reason: 'sequenceNumber gap: expected 5 got 7',
    }).check();
    expect(v.status).toBe('FAIL');
    expect(v.reason).toContain('sequenceNumber gap');
  });

  it('13. FAIL verdict includes measuredBy on guard compromise', async () => {
    const v = await gate('hard_fail', {
      status: 'compromised',
      reason: 'tampered',
    }).check();
    expect(v.measuredBy).toBe('origin-immutability.gate');
  });
});

// ─── Self-check validation (indirect tests) ─────────────────────────

describe('origin-immutability gate — self-check integrity functions', () => {
  it('14. verifyGenesisEvent accepts the canonical GENESIS_EVENT', () => {
    // The gate calls verifyGenesisEvent(GENESIS_EVENT) at the top of check().
    // This test proves the underlying function accepts the canonical event.
    expect(verifyGenesisEvent(GENESIS_EVENT)).toBe(true);
  });

  it('15. computeGenesisHash is deterministic', () => {
    const h1 = computeGenesisHash(GENESIS_EVENT.payload);
    const h2 = computeGenesisHash(GENESIS_EVENT.payload);
    expect(h1).toBe(h2);
    expect(h1).toBe(GENESIS_EVENT.hash);
  });

  it('16. tampered canonicalName produces different hash', () => {
    const payload = cloneGenesisPayload({
      canonicalName: 'NotKloel' as typeof ORGANISM_CANONICAL_NAME,
    });
    const hash = computeGenesisHash(payload);
    expect(hash).not.toBe(GENESIS_EVENT.hash);
  });

  it('17. tampered etymology produces different hash', () => {
    const payload = cloneGenesisPayload({
      etymology: {
        greek: { word: 'different', meaning: 'changed' },
        hebrew: { word: 'different', meaning: 'changed' },
        synthesis: 'compromised',
      },
    });
    const hash = computeGenesisHash(payload);
    expect(hash).not.toBe(GENESIS_EVENT.hash);
  });

  it('18. tampered origin produces different hash', () => {
    const payload = cloneGenesisPayload({
      origin: {
        nature: 'trojan',
        inception: '2020-01-01',
        authorPosture: 'malicious',
      },
    });
    const hash = computeGenesisHash(payload);
    expect(hash).not.toBe(GENESIS_EVENT.hash);
  });

  it('19. tampered steward produces different hash', () => {
    const payload = cloneGenesisPayload({
      steward: {
        role: 'attacker',
        responsibility: 'corrupt',
        posture: 'malicious',
      },
    });
    const hash = computeGenesisHash(payload);
    expect(hash).not.toBe(GENESIS_EVENT.hash);
  });

  it('20. tampered inviolable list produces different hash', () => {
    const payload = cloneGenesisPayload({ inviolable: ['canonicalName', 'etymology'] as const });
    const hash = computeGenesisHash(payload);
    expect(hash).not.toBe(GENESIS_EVENT.hash);
  });

  it('21. tampered eventId fails verifyGenesisEvent', () => {
    const tampered = { ...GENESIS_EVENT, eventId: '01JDEADBEEF0000000000000GE' };
    expect(verifyGenesisEvent(tampered)).toBe(false);
  });

  it('22. wrong eventName fails verifyGenesisEvent', () => {
    const tampered = { ...GENESIS_EVENT, eventName: 'lineage.tampered' };
    expect(verifyGenesisEvent(tampered)).toBe(false);
  });

  it('23. null input fails verifyGenesisEvent', () => {
    expect(verifyGenesisEvent(null)).toBe(false);
  });

  it('24. non-object input fails verifyGenesisEvent', () => {
    expect(verifyGenesisEvent('not-an-object')).toBe(false);
  });

  it('25. missing payload fails verifyGenesisEvent', () => {
    const { payload: _, ...noPayload } = GENESIS_EVENT;
    expect(verifyGenesisEvent(noPayload)).toBe(false);
  });
});

// ─── Mode contract ──────────────────────────────────────────────────

describe('origin-immutability gate — mode contract', () => {
  it('26. hard_fail mode: intact guard → PASS with hard_fail', async () => {
    const v = await gate('hard_fail').check();
    expect(v.status).toBe('PASS');
    expect(v.mode).toBe('hard_fail');
  });

  it('27. hard_fail mode: compromised guard → FAIL with hard_fail', async () => {
    const v = await gate('hard_fail', {
      status: 'compromised',
      reason: 'Genesis rewritten',
    }).check();
    expect(v.status).toBe('FAIL');
    expect(v.mode).toBe('hard_fail');
  });

  it('28. log_only mode: intact guard → PASS with log_only', async () => {
    const v = await gate('log_only').check();
    expect(v.status).toBe('PASS');
    expect(v.mode).toBe('log_only');
  });

  it('29. log_only mode: compromised guard → FAIL with log_only', async () => {
    const v = await gate('log_only', {
      status: 'compromised',
      reason: 'Genesis rewritten',
    }).check();
    // Even in log_only mode, the gate returns FAIL — the mode distinction
    // is consumed by the orchestrator, not by the gate itself.
    expect(v.status).toBe('FAIL');
    expect(v.mode).toBe('log_only');
  });

  it('30. factory preserves explicit mode', () => {
    const g1 = makeOriginImmutabilityGate(mockGuard(), 'hard_fail');
    const g2 = makeOriginImmutabilityGate(mockGuard(), 'log_only');
    expect(extractMode(g1)).toBe('hard_fail');
    expect(extractMode(g2)).toBe('log_only');
  });

  it('31. factory defaults to hard_fail when mode omitted', () => {
    const g = makeOriginImmutabilityGate(mockGuard());
    expect(extractMode(g)).toBe('hard_fail');
  });
});

// ─── Verdict shape contract ─────────────────────────────────────────

describe('origin-immutability gate — verdict shape contract', () => {
  it('32. PASS verdict has no reason', async () => {
    const v = await gate().check();
    expect(v.reason).toBeUndefined();
    expect(v.evidence).toBeUndefined();
  });

  it('33. FAIL verdict always carries a reason', async () => {
    const v = await gate('hard_fail', {
      status: 'compromised',
      reason:
        'entry 1 eventId mismatch — expected 01JD90000000000000000000GE got 01JDEADBEEF0000000000000GE',
    }).check();
    expect(v.status).toBe('FAIL');
    expect(v.reason).toBeDefined();
    expect(v.reason?.length).toBeGreaterThan(0);
  });

  it('34. gate name is always origin-immutability regardless of verdict', async () => {
    const passV = await gate().check();
    const failV = await gate('hard_fail', {
      status: 'compromised',
      reason: 'tampered',
    }).check();
    expect(passV.gateName).toBe('origin-immutability');
    expect(failV.gateName).toBe('origin-immutability');
  });

  it('35. measuredBy is consistent across verdicts', async () => {
    const passV = await gate().check();
    const failV = await gate('hard_fail', {
      status: 'compromised',
      reason: 'tampered',
    }).check();
    expect(passV.measuredBy).toBe('origin-immutability.gate');
    expect(failV.measuredBy).toBe('origin-immutability.gate');
  });
});
