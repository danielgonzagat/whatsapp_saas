import {
  InMemoryLineageLedgerRepository,
  LineageLedgerService,
} from './lineage-ledger.service';
import { GENESIS_EVENT } from './genesis-event';
import { LineageLedgerError, ZERO_HASH } from './lineage-ledger.types';

/**
 * UTP-LINEAGE-002 contract spec.
 */
describe('LineageLedgerService', () => {
  function build() {
    const repo = new InMemoryLineageLedgerRepository();
    const service = new LineageLedgerService(repo);
    return { repo, service };
  }

  describe('bootstrapGenesis', () => {
    it('appends entry 1 with canonical Genesis when ledger is empty', async () => {
      const { service, repo } = build();
      const entry = await service.bootstrapGenesis();
      expect(entry.sequenceNumber).toBe(1);
      expect(entry.prevEntryHash).toBe(ZERO_HASH);
      expect(entry.eventName).toBe('lineage.genesis');
      expect(entry.payload.canonicalName).toBe('Kloel');
      expect(entry.eventId).toBe(GENESIS_EVENT.eventId);
      expect(entry.hash).toMatch(/^[a-f0-9]{64}$/);
      expect(await repo.count()).toBe(1);
    });

    it('hash is deterministic for the same canonical Genesis', async () => {
      const { service: s1 } = build();
      const { service: s2 } = build();
      const e1 = await s1.bootstrapGenesis();
      const e2 = await s2.bootstrapGenesis();
      expect(e1.hash).toBe(e2.hash);
    });

    it('is idempotent — second call no-ops when first entry is canonical', async () => {
      const { service, repo } = build();
      const e1 = await service.bootstrapGenesis();
      const e2 = await service.bootstrapGenesis();
      expect(e2.hash).toBe(e1.hash);
      expect(await repo.count()).toBe(1);
    });
  });

  describe('append', () => {
    it('appends a capability_acquired entry chained to Genesis', async () => {
      const { service } = build();
      await service.bootstrapGenesis();
      const entry = await service.append({
        ledgerEntryId: '01JD90000000000000000002',
        eventId: '01JD9X1000000000000000ABI',
        eventName: 'lineage.capability_acquired',
        timestamp: '2026-05-13T20:01:33.000Z',
        payload: {
          capabilityId: 'abi-builder',
          maturity: 'developing',
          runtimeEvidencePct: 5,
          acquiredVia: 'UTP-ABI-002 inicial',
        },
      });
      expect(entry.sequenceNumber).toBe(2);
      expect(entry.prevEntryHash).toMatch(/^[a-f0-9]{64}$/);
      expect(entry.prevEntryHash).not.toBe(ZERO_HASH);
    });

    it('chains entries — entry N prevEntryHash equals entry (N-1) hash', async () => {
      const { service } = build();
      const g = await service.bootstrapGenesis();
      const e2 = await service.append({
        ledgerEntryId: '01JD90000000000000000002',
        eventId: '01JD9X1000000000000000ABI',
        eventName: 'lineage.capability_acquired',
        timestamp: '2026-05-13T20:01:33.000Z',
        payload: {
          capabilityId: 'abi-builder',
          maturity: 'developing',
          runtimeEvidencePct: 5,
          acquiredVia: 'UTP-ABI-002 inicial',
        },
      });
      const e3 = await service.append({
        ledgerEntryId: '01JD90000000000000000003',
        eventId: '01JD9X2000000000000000PUL',
        eventName: 'lineage.ciclo_pulse_nao_regressivo',
        timestamp: '2026-05-13T22:30:00.000Z',
        payload: { cycleNumber: 1, score: 0.42, verdict: 'INSUFFICIENT_EVIDENCE' },
      });
      expect(e2.prevEntryHash).toBe(g.hash);
      expect(e3.prevEntryHash).toBe(e2.hash);
      expect(e3.sequenceNumber).toBe(3);
    });

    it('rejects append before bootstrap', async () => {
      const { service } = build();
      await expect(
        service.append({
          ledgerEntryId: 'x',
          eventId: 'y',
          eventName: 'lineage.capability_acquired',
          timestamp: '2026-05-13T20:00:00.000Z',
          payload: {
            capabilityId: 'x',
            maturity: 'developing',
            runtimeEvidencePct: 0,
            acquiredVia: 'test',
          },
        }),
      ).rejects.toThrow(/LINEAGE_LEDGER_NOT_BOOTSTRAPPED/);
    });
  });

  describe('append-only enforcement', () => {
    it('rejects duplicate hash', async () => {
      const { service, repo } = build();
      const g = await service.bootstrapGenesis();
      await expect(
        repo.append({ ...g, sequenceNumber: 99 }),
      ).rejects.toThrow(/LINEAGE_LEDGER_DUPLICATE_HASH/);
    });

    it('rejects duplicate sequenceNumber', async () => {
      const { service, repo } = build();
      await service.bootstrapGenesis();
      const tail = await service.getTail();
      await expect(
        repo.append({
          ledgerEntryId: 'fake',
          sequenceNumber: 1,
          prevEntryHash: ZERO_HASH,
          eventId: 'x',
          eventName: 'lineage.capability_acquired',
          timestamp: '2026-05-13T20:00:00.000Z',
          payload: {
            capabilityId: 'x',
            maturity: 'developing',
            runtimeEvidencePct: 0,
            acquiredVia: 'test',
          },
          hash: 'a'.repeat(64),
        }),
      ).rejects.toThrow(/LINEAGE_LEDGER_DUPLICATE_SEQUENCE/);
      expect(tail).not.toBeNull();
    });

    it('rejects non-monotonic sequenceNumber', async () => {
      const { service, repo } = build();
      const g = await service.bootstrapGenesis();
      await expect(
        repo.append({
          ledgerEntryId: 'x',
          sequenceNumber: 5,
          prevEntryHash: g.hash,
          eventId: 'x',
          eventName: 'lineage.capability_acquired',
          timestamp: '2026-05-13T20:00:00.000Z',
          payload: {
            capabilityId: 'x',
            maturity: 'developing',
            runtimeEvidencePct: 0,
            acquiredVia: 'test',
          },
          hash: 'a'.repeat(64),
        }),
      ).rejects.toThrow(/LINEAGE_LEDGER_NON_MONOTONIC_SEQUENCE/);
    });

    it('rejects broken chain (prevEntryHash mismatch)', async () => {
      const { service, repo } = build();
      await service.bootstrapGenesis();
      await expect(
        repo.append({
          ledgerEntryId: 'x',
          sequenceNumber: 2,
          prevEntryHash: 'b'.repeat(64),
          eventId: 'x',
          eventName: 'lineage.capability_acquired',
          timestamp: '2026-05-13T20:00:00.000Z',
          payload: {
            capabilityId: 'x',
            maturity: 'developing',
            runtimeEvidencePct: 0,
            acquiredVia: 'test',
          },
          hash: 'a'.repeat(64),
        }),
      ).rejects.toThrow(/LINEAGE_LEDGER_BROKEN_CHAIN/);
    });

    it('first entry must be sequence=1 with prevEntryHash=ZERO_HASH', async () => {
      const repo = new InMemoryLineageLedgerRepository();
      await expect(
        repo.append({
          ledgerEntryId: 'x',
          sequenceNumber: 7,
          prevEntryHash: ZERO_HASH,
          eventId: 'x',
          eventName: 'lineage.capability_acquired',
          timestamp: '2026-05-13T20:00:00.000Z',
          payload: {
            capabilityId: 'x',
            maturity: 'developing',
            runtimeEvidencePct: 0,
            acquiredVia: 'test',
          },
          hash: 'a'.repeat(64),
        }),
      ).rejects.toThrow(/LINEAGE_LEDGER_FIRST_MUST_BE_SEQ_1/);
    });

    it('listAll returns frozen array (cannot mutate ledger via callers)', async () => {
      const { service, repo } = build();
      await service.bootstrapGenesis();
      const all = await repo.listAll();
      expect(Object.isFrozen(all)).toBe(true);
    });

    it('LineageLedgerError carries code', () => {
      const err = new LineageLedgerError('TEST_CODE', 'message', { foo: 1 });
      expect(err.code).toBe('TEST_CODE');
      expect(err.meta).toEqual({ foo: 1 });
      expect(err.message).toContain('[TEST_CODE]');
    });
  });

  describe('listFromSequence', () => {
    it('returns entries with sequenceNumber >= from', async () => {
      const { service } = build();
      await service.bootstrapGenesis();
      await service.append({
        ledgerEntryId: 'b',
        eventId: 'eb',
        eventName: 'lineage.capability_acquired',
        timestamp: '2026-05-13T21:00:00.000Z',
        payload: {
          capabilityId: 'x',
          maturity: 'developing',
          runtimeEvidencePct: 1,
          acquiredVia: 't',
        },
      });
      await service.append({
        ledgerEntryId: 'c',
        eventId: 'ec',
        eventName: 'lineage.ciclo_pulse_nao_regressivo',
        timestamp: '2026-05-13T22:00:00.000Z',
        payload: { cycleNumber: 1, score: 0.5, verdict: 'INSUFFICIENT_EVIDENCE' },
      });
      const fromTwo = await service.getFromSequence(2);
      expect(fromTwo).toHaveLength(2);
      expect(fromTwo[0]?.sequenceNumber).toBe(2);
      expect(fromTwo[1]?.sequenceNumber).toBe(3);
    });
  });
});
