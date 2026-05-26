import {
  InMemoryLineageLedgerRepository,
  LineageLedgerService,
} from '../lineage/lineage-ledger.service';
import { LineageGuardService } from '../lineage/lineage-guard.service';
import { IdentityProjectorService } from '../lineage/identity-projector.service';
import { AbiBuilderService, AbiBuildInput } from './abi-builder.service';
import { ABI_VERSION } from './abi-schema';
import { validateAbiPayload } from './abi-validator';
import type { LineageEntry } from '../lineage/lineage-ledger.types';

/**
 * UTP-ABI-002 contract spec.
 */
describe('AbiBuilderService — shadow mode composition', () => {
  async function build() {
    const repo = new InMemoryLineageLedgerRepository();
    const ledger = new LineageLedgerService(repo);
    const guard = new LineageGuardService(repo);
    const projector = new IdentityProjectorService(guard);
    const builder = new AbiBuilderService(projector);
    await ledger.bootstrapGenesis();
    return { repo, ledger, guard, projector, builder };
  }

  function defaultInput(audience: 'public' | 'technical' | 'origin' | 'internal'): AbiBuildInput {
    return {
      audience,
      currentInput: {
        raw: 'Quanto custa o plano básico?',
        channel: 'whatsapp',
        arrivalTimestamp: '2026-05-13T20:14:31.880Z',
      },
      perceptionSnapshot: {
        channel: 'whatsapp',
        workspaceId: 'wks_demo',
        leadRef: { entityType: 'lead', entityId: 'lead_8f4c9b' },
      },
      capabilityIds: ['lineage', 'abi-builder'],
      now: new Date('2026-05-20T20:00:00.000Z'),
    };
  }

  it('builds a valid public ABI with canonical lineage', async () => {
    const { builder } = await build();
    const result = await builder.build(defaultInput('public'));
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') {throw new Error('not ok');}
    const { abi } = result;
    expect(abi.abiVersion).toBe(ABI_VERSION);
    expect(abi.lineage.canonicalName).toBe('Kloel');
    expect(abi.lineage.lineageStatus).toBe('intact');
    expect(abi.lineage.operationalAge.sinceGenesisDays).toBeGreaterThanOrEqual(7);
    expect(abi.lineage.capabilities).toEqual(['lineage', 'abi-builder']);
    expect(abi.identityProjection.audience).toBe('public');
    expect(abi.identityProjection.currentMaturity).toBe('developing');
    expect(abi.currentInput.raw).toBe('Quanto custa o plano básico?');
    expect(abi.perception.currentSnapshot.workspaceId).toBe('wks_demo');
  });

  it('emitted ABI passes validateAbiPayload', async () => {
    const { builder } = await build();
    const result = await builder.build(defaultInput('public'));
    if (result.status !== 'ok') {throw new Error('not ok');}
    const verdict = validateAbiPayload(result.abi);
    expect(verdict.status).toBe('PASS');
    expect(verdict.issues).toHaveLength(0);
  });

  it('reports lineage_compromised when ledger is broken — does NOT build ABI', async () => {
    const { repo, builder } = await build();
    const internal = (repo as { entries: LineageEntry[] }).entries;
    internal[0] = { ...internal[0]!, hash: 'a'.repeat(64) };
    const result = await builder.build(defaultInput('public'));
    expect(result.status).toBe('lineage_compromised');
  });

  it('builds technical ABI with genesisEventId surfaced', async () => {
    const { builder } = await build();
    const result = await builder.build(defaultInput('technical'));
    if (result.status !== 'ok') {throw new Error('not ok');}
    expect(result.abi.lineage.genesisEventId).toBe('01JD90000000000000000000GE');
  });

  it('refuses origin audience without authorization (lineage_compromised cause)', async () => {
    const { builder } = await build();
    const result = await builder.build(defaultInput('origin'));
    expect(result.status).toBe('lineage_compromised');
  });

  it('respects originAuthorization when provided', async () => {
    const { builder } = await build();
    const inp = {
      ...defaultInput('origin'),
      originAuthorization: {
        grantedAt: '2026-05-13T22:00:00.000Z',
        grantedBy: 'steward',
      },
    };
    const result = await builder.build(inp);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') {throw new Error('not ok');}
    expect(result.abi.identityProjection.audience).toBe('origin');
  });

  it('declares capabilities with runtimeEvidencePct > 0 (no-overclaim)', async () => {
    const { builder } = await build();
    const result = await builder.build(defaultInput('technical'));
    if (result.status !== 'ok') {throw new Error('not ok');}
    for (const cap of result.abi.capabilities.available) {
      expect(cap.runtimeEvidencePct).toBeGreaterThan(0);
    }
  });

  it('payload contains NO behavioral instruction string anywhere (no-roleplay)', async () => {
    const { builder } = await build();
    const result = await builder.build(defaultInput('public'));
    if (result.status !== 'ok') {throw new Error('not ok');}
    const serialized = JSON.stringify(result.abi);
    expect(serialized).not.toMatch(/\bvoc[êe]\s+(é|es)\b/i);
    expect(serialized).not.toMatch(/\byou are\b/i);
    expect(serialized).not.toMatch(/\bsempre\b/i);
    expect(serialized).not.toMatch(/\bnunca\b/i);
    expect(serialized).not.toMatch(/\bact as\b/i);
    expect(serialized).not.toMatch(/\bseu papel\b/i);
  });

  it('builder is pure — same input produces same output', async () => {
    const { builder } = await build();
    const inp = defaultInput('public');
    const r1 = await builder.build(inp);
    const r2 = await builder.build(inp);
    expect(r1).toEqual(r2);
  });
});
