import {
  InMemoryLineageLedgerRepository,
  LineageLedgerService,
} from './lineage-ledger.service';
import { LineageGuardService } from './lineage-guard.service';
import { LineageEntry, ZERO_HASH } from './lineage-ledger.types';

/**
 * UTP-LINEAGE-003 contract spec.
 */
describe('LineageGuardService', () => {
  function build() {
    const repo = new InMemoryLineageLedgerRepository();
    const service = new LineageLedgerService(repo);
    const guard = new LineageGuardService(repo);
    return { repo, service, guard };
  }

  it('returns compromised when ledger is empty', async () => {
    const { guard } = build();
    const v = await guard.verify();
    expect(v.status).toBe('compromised');
    expect(v.reason).toMatch(/empty/i);
    expect(v.entryCount).toBe(0);
  });

  it('returns intact after bootstrap only', async () => {
    const { service, guard } = build();
    await service.bootstrapGenesis();
    const v = await guard.verify();
    expect(v.status).toBe('intact');
    expect(v.entryCount).toBe(1);
    expect(v.tailSequenceNumber).toBe(1);
    expect(v.tailHash).toMatch(/^[a-f0-9]{64}$/);
    expect(v.genesisHash).toBe(v.tailHash);
  });

  it('returns intact for valid 3-entry chain', async () => {
    const { service, guard } = build();
    await service.bootstrapGenesis();
    await service.append({
      ledgerEntryId: '02',
      eventId: 'eb',
      eventName: 'lineage.capability_acquired',
      timestamp: '2026-05-13T20:01:00.000Z',
      payload: {
        capabilityId: 'abi',
        maturity: 'developing',
        runtimeEvidencePct: 5,
        acquiredVia: 'utp',
      },
    });
    await service.append({
      ledgerEntryId: '03',
      eventId: 'ec',
      eventName: 'lineage.ciclo_pulse_nao_regressivo',
      timestamp: '2026-05-13T20:02:00.000Z',
      payload: { cycleNumber: 1, score: 0.5, verdict: 'INSUFFICIENT_EVIDENCE' },
    });
    const v = await guard.verify();
    expect(v.status).toBe('intact');
    expect(v.entryCount).toBe(3);
    expect(v.tailSequenceNumber).toBe(3);
  });

  it('detects tampering of payload (canonicalName mutation)', async () => {
    const { service, repo, guard } = build();
    await service.bootstrapGenesis();
    const all = (await repo.listAll());
    // Direct write via private internals — simulating storage tamper.
    const internalEntries = (
      repo as { entries: LineageEntry[] }
    ).entries;
    const tampered: LineageEntry = {
      ...all[0]!,
      payload: {
        ...all[0]!.payload,
        canonicalName: 'NotKloel',
      } as never,
    };
    internalEntries[0] = tampered;
    const v = await guard.verify();
    expect(v.status).toBe('compromised');
    expect(v.reason).toMatch(/canonicalName|Genesis/i);
  });

  it('detects broken chain (prevEntryHash mismatch)', async () => {
    const { service, repo, guard } = build();
    await service.bootstrapGenesis();
    await service.append({
      ledgerEntryId: '02',
      eventId: 'eb',
      eventName: 'lineage.capability_acquired',
      timestamp: '2026-05-13T20:01:00.000Z',
      payload: {
        capabilityId: 'x',
        maturity: 'developing',
        runtimeEvidencePct: 0,
        acquiredVia: 't',
      },
    });
    const internal = (repo as { entries: LineageEntry[] }).entries;
    internal[1] = { ...internal[1]!, prevEntryHash: 'b'.repeat(64) };
    const v = await guard.verify();
    expect(v.status).toBe('compromised');
    expect(v.reason).toMatch(/broken chain/i);
    expect(v.offendingEntry?.sequenceNumber).toBe(2);
  });

  it('detects sequence gap', async () => {
    const { service, repo, guard } = build();
    await service.bootstrapGenesis();
    await service.append({
      ledgerEntryId: '02',
      eventId: 'eb',
      eventName: 'lineage.capability_acquired',
      timestamp: '2026-05-13T20:01:00.000Z',
      payload: {
        capabilityId: 'x',
        maturity: 'developing',
        runtimeEvidencePct: 0,
        acquiredVia: 't',
      },
    });
    const internal = (repo as { entries: LineageEntry[] }).entries;
    internal[1] = { ...internal[1]!, sequenceNumber: 99 };
    const v = await guard.verify();
    expect(v.status).toBe('compromised');
    expect(v.reason).toMatch(/sequenceNumber gap/i);
  });

  it('detects hash mismatch (entry stored hash differs from recomputation)', async () => {
    const { service, repo, guard } = build();
    await service.bootstrapGenesis();
    await service.append({
      ledgerEntryId: '02',
      eventId: 'eb',
      eventName: 'lineage.capability_acquired',
      timestamp: '2026-05-13T20:01:00.000Z',
      payload: {
        capabilityId: 'x',
        maturity: 'developing',
        runtimeEvidencePct: 0,
        acquiredVia: 't',
      },
    });
    const internal = (repo as { entries: LineageEntry[] }).entries;
    internal[1] = { ...internal[1]!, hash: 'a'.repeat(64) };
    const v = await guard.verify();
    expect(v.status).toBe('compromised');
    expect(v.reason).toMatch(/hash mismatch/i);
  });

  it('detects entry 1 with non-genesis eventName', async () => {
    const { service, repo, guard } = build();
    await service.bootstrapGenesis();
    const internal = (repo as { entries: LineageEntry[] }).entries;
    internal[0] = {
      ...internal[0]!,
      eventName: 'lineage.capability_acquired',
    };
    const v = await guard.verify();
    expect(v.status).toBe('compromised');
    expect(v.reason).toMatch(/lineage\.genesis/i);
  });

  it('detects entry 1 with non-zero prevEntryHash', async () => {
    const { service, repo, guard } = build();
    await service.bootstrapGenesis();
    const internal = (repo as { entries: LineageEntry[] }).entries;
    internal[0] = { ...internal[0]!, prevEntryHash: 'a'.repeat(64) };
    const v = await guard.verify();
    expect(v.status).toBe('compromised');
    expect(v.reason).toMatch(/ZERO_HASH/);
  });

  it('verdict carries checkedAt as ISO timestamp', async () => {
    const { service, guard } = build();
    await service.bootstrapGenesis();
    const v = await guard.verify();
    expect(v.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
