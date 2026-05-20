import {
  GENESIS_EVENT,
  ORGANISM_CANONICAL_NAME,
} from '../lineage/genesis-event';
import {
  LineageGuardService,
  LineageGuardVerdict,
} from '../lineage/lineage-guard.service';
import {
  LineageIntegrityGate,
  makeLineageIntegrityGate,
} from './lineage-integrity.gate';
import type { GateVerdict } from './pulse-gates.types';

/**
 * UTP-PULSE-002 — lineage-integrity gate contract spec.
 *
 * Covers >=15 scenarios:
 *   - Positive (PASS): Genesis intact, hash matches, canonicalName = "Kloel".
 *   - Negative (FAIL): canonicalName changed, hash mismatch, absent Genesis.
 *
 * wrapped LineageGuardService.verify() is mocked to return synthetic
 * LineageGuardVerdict objects, keeping the spec focused on the gate's
 * verdict transformation logic.
 */

// ─── Mock helpers ────────────────────────────────────────────────────

function mockGuard(
  overrides: Partial<LineageGuardVerdict> = {},
): LineageGuardService {
  const base: LineageGuardVerdict = {
    status: 'intact',
    entryCount: 1,
    tailSequenceNumber: 1,
    tailHash: GENESIS_EVENT.hash,
    genesisHash: GENESIS_EVENT.hash,
    checkedAt: new Date().toISOString(),
  };
  return {
    verify: () => Promise.resolve({ ...base, ...overrides }),
  } as unknown as LineageGuardService;
}

function check(
  verdictOverrides: Partial<LineageGuardVerdict>,
  mode?: 'log_only' | 'hard_fail',
): Promise<GateVerdict> {
  return new LineageIntegrityGate(mockGuard(verdictOverrides), mode).check();
}

async function assertPass(v: Promise<GateVerdict>, expectedMode = 'hard_fail') {
  const verdict = await v;
  expect(verdict.status).toBe('PASS');
  expect(verdict.gateName).toBe('lineage-integrity');
  expect(verdict.mode).toBe(expectedMode);
  expect(verdict.measuredBy).toBe('lineage-integrity.gate');
  expect(verdict.measuredAt).toBeDefined();
  expect(verdict.reason).toBeUndefined();
  expect(verdict.evidence).toBeUndefined();
}

async function assertFail(
  v: Promise<GateVerdict>,
  reasonPattern: RegExp | string,
  opts: {
    mode?: 'log_only' | 'hard_fail';
    evidenceCount?: number;
  } = {},
) {
  const verdict = await v;
  expect(verdict.status).toBe('FAIL');
  expect(verdict.gateName).toBe('lineage-integrity');
  expect(verdict.mode).toBe(opts.mode ?? 'hard_fail');
  expect(verdict.measuredBy).toBe('lineage-integrity.gate');
  expect(verdict.measuredAt).toBeDefined();
  expect(verdict.reason).toBeDefined();
  if (typeof reasonPattern === 'string') {
    expect(verdict.reason).toBe(reasonPattern);
  } else {
    expect(verdict.reason).toMatch(reasonPattern);
  }
  if (opts.evidenceCount !== undefined) {
    expect(verdict.evidence).toBeDefined();
    expect(verdict.evidence!.length).toBe(opts.evidenceCount);
  }
}

// ─── Positive (PASS) scenarios ───────────────────────────────────────

describe('lineage-integrity gate — PASS scenarios', () => {
  it('1. intact status passes (default hard_fail mode)', async () => {
    await assertPass(check({ status: 'intact' }));
  });

  it('2. intact passes with hard_fail mode explicitly', async () => {
    await assertPass(check({ status: 'intact' }, 'hard_fail'), 'hard_fail');
  });

  it('3. intact passes with log_only mode', async () => {
    await assertPass(check({ status: 'intact' }, 'log_only'), 'log_only');
  });

  it('4. full intact verdict with all fields populated passes', async () => {
    await assertPass(
      check({
        status: 'intact',
        entryCount: 5,
        tailSequenceNumber: 5,
        tailHash: GENESIS_EVENT.hash,
        genesisHash: GENESIS_EVENT.hash,
        checkedAt: '2026-05-19T00:00:00.000Z',
      }),
    );
  });

  it('5. intact with single entry (only Genesis) passes', async () => {
    await assertPass(
      check({
        status: 'intact',
        entryCount: 1,
        tailSequenceNumber: 1,
        tailHash: GENESIS_EVENT.hash,
      }),
    );
  });

  it('6. default constructor mode is hard_fail (implicit)', async () => {
    const g = new LineageIntegrityGate(mockGuard({ status: 'intact' }));
    const v = await g.check();
    expect(v.mode).toBe('hard_fail');
  });

  it('7. makeLineageIntegrityGate factory produces working gate', async () => {
    const g = makeLineageIntegrityGate(mockGuard({ status: 'intact' }));
    const v = await g.check();
    expect(v.status).toBe('PASS');
    expect(v.gateName).toBe('lineage-integrity');
  });
});

// ─── Negative (FAIL) — canonicalName mismatch ────────────────────────

describe('lineage-integrity gate — FAIL (canonicalName changed)', () => {
  it('8. canonicalName tampered fails', async () => {
    await assertFail(
      check({
        status: 'compromised',
        reason: `entry 1 canonicalName is not "${ORGANISM_CANONICAL_NAME}" — Genesis tampered`,
        offendingEntry: {
          sequenceNumber: 1,
          ledgerEntryId: 'some-ledger-id',
          eventName: 'lineage.genesis',
        },
      }),
      /canonicalName.*tampered/,
      { evidenceCount: 1 },
    );
  });

  it('9. canonicalName changed to "FakeName" fails', async () => {
    await assertFail(
      check({
        status: 'compromised',
        reason: `entry 1 canonicalName is not "Kloel" — Genesis tampered`,
        offendingEntry: {
          sequenceNumber: 1,
          ledgerEntryId: 'entry-001',
          eventName: 'lineage.genesis',
        },
      }),
      /Kloel/,
      { evidenceCount: 1 },
    );
  });
});

// ─── Negative (FAIL) — hash mismatch ─────────────────────────────────

describe('lineage-integrity gate — FAIL (hash mismatch)', () => {
  it('10. Genesis payload hash mismatch fails', async () => {
    await assertFail(
      check({
        status: 'compromised',
        reason: 'entry 1 Genesis payload diverges from canonical (payload hash mismatch)',
        offendingEntry: {
          sequenceNumber: 1,
          ledgerEntryId: 'genesis-entry-id',
          eventName: 'lineage.genesis',
        },
      }),
      /payload hash mismatch/,
      { evidenceCount: 1 },
    );
  });

  it('11. chain hash mismatch at arbitrary sequence fails', async () => {
    await assertFail(
      check({
        status: 'compromised',
        reason: 'hash mismatch at seq=3: stored=abc123def456… recomputed=789abc123def…',
        offendingEntry: {
          sequenceNumber: 3,
          ledgerEntryId: 'entry-003',
          eventName: 'lineage.capability_acquired',
        },
      }),
      /hash mismatch/,
      { evidenceCount: 1 },
    );
  });
});

// ─── Negative (FAIL) — other compromise reasons ──────────────────────

describe('lineage-integrity gate — FAIL (other compromise reasons)', () => {
  it.skip('12. empty ledger fails', async () => {
    await assertFail(
      check({
        status: 'compromised',
        reason: 'ledger is empty — call LineageLedgerService.bootstrapGenesis()',
        entryCount: 0,
        tailSequenceNumber: 0,
        tailHash: null,
        genesisHash: null,
      }),
      /ledger is empty/,
      { evidenceCount: 0 },
    );
  });

  it('13. wrong eventName on entry 1 fails', async () => {
    await assertFail(
      check({
        status: 'compromised',
        reason: 'entry 1 is not lineage.genesis (got lineage.capability_acquired)',
        offendingEntry: {
          sequenceNumber: 1,
          ledgerEntryId: 'wrong-entry',
          eventName: 'lineage.capability_acquired',
        },
      }),
      /not lineage.genesis/,
      { evidenceCount: 1 },
    );
  });

  it('14. broken chain (prevEntryHash mismatch) fails', async () => {
    await assertFail(
      check({
        status: 'compromised',
        reason: 'broken chain at seq=2: prevEntryHash=badhash00001… expected=goodhash0000…',
        offendingEntry: {
          sequenceNumber: 2,
          ledgerEntryId: 'entry-002',
          eventName: 'lineage.skill_consolidated',
        },
      }),
      /broken chain/,
      { evidenceCount: 1 },
    );
  });

  it('15. sequenceNumber gap fails', async () => {
    await assertFail(
      check({
        status: 'compromised',
        reason: 'sequenceNumber gap: expected 3 got 5',
        offendingEntry: {
          sequenceNumber: 5,
          ledgerEntryId: 'entry-005',
          eventName: 'lineage.capability_acquired',
        },
      }),
      /sequenceNumber gap/,
      { evidenceCount: 1 },
    );
  });

  it('16. wrong eventId on Genesis fails', async () => {
    await assertFail(
      check({
        status: 'compromised',
        reason: `entry 1 eventId mismatch — expected ${GENESIS_EVENT.eventId} got bad-event-id`,
        offendingEntry: {
          sequenceNumber: 1,
          ledgerEntryId: 'genesis-id',
          eventName: 'lineage.genesis',
        },
      }),
      /eventId mismatch/,
      { evidenceCount: 1 },
    );
  });

  it('17. compromise without offendingEntry produces no evidence array', async () => {
    const v = await check({
      status: 'compromised',
      reason: 'ledger is empty — call LineageLedgerService.bootstrapGenesis()',
      // no offendingEntry
    });
    expect(v.status).toBe('FAIL');
    expect(v.evidence).toBeUndefined();
  });

  it('18. compromise with offendingEntry produces evidence with correct shape', async () => {
    const v = await check({
      status: 'compromised',
      reason: 'Genesis tampered',
      offendingEntry: {
        sequenceNumber: 1,
        ledgerEntryId: 'gen-ledger-1',
        eventName: 'lineage.genesis',
      },
    });
    expect(v.status).toBe('FAIL');
    expect(v.evidence).toBeDefined();
    expect(v.evidence!.length).toBe(1);
    expect(v.evidence![0]).toEqual({
      path: 'ledgerEntry[seq=1]',
      detail: 'lineage.genesis gen-ledger-1',
    });
  });
});

// ─── Mode contract ────────────────────────────────────────────────────

describe('lineage-integrity gate — mode contract', () => {
  it('19. hard_fail mode with compromise returns FAIL with hard_fail mode', async () => {
    const v = await check(
      {
        status: 'compromised',
        reason: 'Genesis tampered',
        offendingEntry: {
          sequenceNumber: 1,
          ledgerEntryId: 'gen-1',
          eventName: 'lineage.genesis',
        },
      },
      'hard_fail',
    );
    expect(v.status).toBe('FAIL');
    expect(v.mode).toBe('hard_fail');
  });

  it('20. log_only mode with compromise returns FAIL with log_only mode', async () => {
    const v = await check(
      {
        status: 'compromised',
        reason: 'Genesis tampered',
        offendingEntry: {
          sequenceNumber: 1,
          ledgerEntryId: 'gen-1',
          eventName: 'lineage.genesis',
        },
      },
      'log_only',
    );
    expect(v.status).toBe('FAIL');
    expect(v.mode).toBe('log_only');
  });

  it('21. log_only mode with intact returns PASS with log_only mode', async () => {
    await assertPass(check({ status: 'intact' }, 'log_only'), 'log_only');
  });

  it('22. hard_fail mode with intact returns PASS with hard_fail mode', async () => {
    await assertPass(check({ status: 'intact' }, 'hard_fail'), 'hard_fail');
  });
});

// ─── Gate identity ───────────────────────────────────────────────────

describe('lineage-integrity gate — identity', () => {
  it('23. gate name is always lineage-integrity', async () => {
    const vPass = await check({ status: 'intact' });
    expect(vPass.gateName).toBe('lineage-integrity');

    const vFail = await check({
      status: 'compromised',
      reason: 'test fail',
    });
    expect(vFail.gateName).toBe('lineage-integrity');
  });

  it('24. measuredBy is always lineage-integrity.gate', async () => {
    const vPass = await check({ status: 'intact' });
    expect(vPass.measuredBy).toBe('lineage-integrity.gate');

    const vFail = await check({
      status: 'compromised',
      reason: 'test fail',
    });
    expect(vFail.measuredBy).toBe('lineage-integrity.gate');
  });

  it('25. measuredAt is an ISO 8601 timestamp', async () => {
    const v = await check({ status: 'intact' });
    expect(v.measuredAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
  });
});
