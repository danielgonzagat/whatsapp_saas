import { Test, TestingModule } from '@nestjs/testing';
import { GENESIS_EVENT } from './genesis-event';
import { LineageGuardService } from './lineage-guard.service';
import {
  InMemoryLineageLedgerRepository,
  LineageLedgerService,
} from './lineage-ledger.service';
import { LineageBootstrapHook } from './lineage.module';
import { LINEAGE_LEDGER_REPOSITORY } from './lineage.tokens';

/**
 * UTP-LINEAGE gap-A contract spec — Genesis bootstrap wiring.
 *
 * Verifies:
 *   1. OnModuleInit creates entry 1 with canonical Genesis when the
 *      ledger is empty.
 *   2. The LineageGuardService reports 'intact' immediately after boot
 *      (Genesis present, chain valid, hash verified).
 *   3. A second module init (simulated via direct bootstrapGenesis call)
 *      does NOT duplicate entry 1 — the operation is idempotent.
 */
describe('LineageBootstrapHook — OnModuleInit Genesis wiring', () => {
  let moduleRef: TestingModule;
  let ledger: LineageLedgerService;
  let guard: LineageGuardService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        {
          provide: LINEAGE_LEDGER_REPOSITORY,
          useClass: InMemoryLineageLedgerRepository,
        },
        LineageLedgerService,
        LineageBootstrapHook,
        LineageGuardService,
      ],
    }).compile();

    await moduleRef.init();

    ledger = moduleRef.get(LineageLedgerService);
    guard = moduleRef.get(LineageGuardService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  describe('onModuleInit creates entry 1 with canonical Genesis', () => {
    it('appends exactly one entry to the ledger', async () => {
      const entries = await ledger.getAll();
      expect(entries.length).toBe(1);
    });

    it('entry 1 is the canonical Genesis (eventName, canonicalName, eventId)', async () => {
      const entries = await ledger.getAll();
      const entry = entries[0];
      expect(entry).toBeDefined();
      expect(entry.sequenceNumber).toBe(1);
      expect(entry.eventName).toBe('lineage.genesis');
      expect(entry.eventId).toBe(GENESIS_EVENT.eventId);
      expect(entry.payload.canonicalName).toBe('Kloel');
    });

    it('entry 1 prevEntryHash is ZERO_HASH', async () => {
      const entries = await ledger.getAll();
      expect(entries[0].prevEntryHash).toBe(
        '0000000000000000000000000000000000000000000000000000000000000000',
      );
    });

    it('entry 1 hash is a 64-char hex string', async () => {
      const entries = await ledger.getAll();
      expect(entries[0].hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('LineageGuardService reports intact immediately after boot', () => {
    it('guard status is intact', async () => {
      const verdict = await guard.verify();
      expect(verdict.status).toBe('intact');
    });

    it('guard reports entryCount=1', async () => {
      const verdict = await guard.verify();
      expect(verdict.entryCount).toBe(1);
    });

    it('guard tailSequenceNumber is 1', async () => {
      const verdict = await guard.verify();
      expect(verdict.tailSequenceNumber).toBe(1);
    });

    it('guard genesisHash matches entry 1 hash', async () => {
      const entries = await ledger.getAll();
      const verdict = await guard.verify();
      expect(verdict.genesisHash).toBe(entries[0].hash);
    });

    it('guard checkedAt is an ISO timestamp', async () => {
      const verdict = await guard.verify();
      expect(verdict.checkedAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
      );
    });
  });

  describe('idempotent — second module init does not duplicate', () => {
    it('calling bootstrapGenesis() again keeps entry count at 1', async () => {
      const countBefore = (await ledger.getAll()).length;
      expect(countBefore).toBe(1);

      await ledger.bootstrapGenesis();
      const countAfter = (await ledger.getAll()).length;
      expect(countAfter).toBe(1);
    });

    it('guard remains intact after duplicate bootstrapGenesis', async () => {
      const verdict = await guard.verify();
      expect(verdict.status).toBe('intact');
      expect(verdict.entryCount).toBe(1);
    });

    it('repeated bootstrapGenesis returns the same entry (same hash)', async () => {
      const e1 = await ledger.bootstrapGenesis();
      const e2 = await ledger.bootstrapGenesis();
      expect(e2.hash).toBe(e1.hash);
      expect(e2.sequenceNumber).toBe(e1.sequenceNumber);
    });
  });

  describe('second independent module init is idempotent', () => {
    it('a fresh module init also ends with exactly 1 entry', async () => {
      const fresh = await Test.createTestingModule({
        providers: [
          {
            provide: LINEAGE_LEDGER_REPOSITORY,
            useClass: InMemoryLineageLedgerRepository,
          },
          LineageLedgerService,
          LineageBootstrapHook,
          LineageGuardService,
        ],
      }).compile();

      await fresh.init();

      try {
        const freshLedger = fresh.get(LineageLedgerService);
        const freshGuard = fresh.get(LineageGuardService);

        const entries = await freshLedger.getAll();
        expect(entries.length).toBe(1);
        expect(entries[0].eventName).toBe('lineage.genesis');

        const verdict = await freshGuard.verify();
        expect(verdict.status).toBe('intact');
      } finally {
        await fresh.close();
      }
    });
  });
});
