import {
  InMemoryLineageLedgerRepository,
  LineageLedgerService,
} from './lineage-ledger.service';
import { LineageGuardService } from './lineage-guard.service';
import {
  IdentityProjectorService,
  isCompromisedProjection,
  isInternalProjection,
  isOriginProjection,
  isPublicProjection,
  isTechnicalProjection,
} from './identity-projector.service';
import type { LineageEntry } from './lineage-ledger.types';

/**
 * UTP-LINEAGE-005 — Audience isolation contract spec.
 *
 * Validates PCI.3 §6: origin spiritual content NEVER leaks into the public
 * audience; each audience receives only what is allowed.
 */

describe('IdentityProjectorService — audience isolation', () => {
  async function build() {
    const repo = new InMemoryLineageLedgerRepository();
    const ledger = new LineageLedgerService(repo);
    const guard = new LineageGuardService(repo);
    const projector = new IdentityProjectorService(guard);
    await ledger.bootstrapGenesis();
    return { repo, ledger, guard, projector };
  }

  describe('public audience', () => {
    it('exposes canonicalName + operationalAge — and nothing about origin', async () => {
      const { projector } = await build();
      const p = await projector.project({
        audience: 'public',
        firstWorkspaceActivatedAt: '2026-05-13T20:00:00.000Z',
        now: new Date('2026-05-20T20:00:00.000Z'),
      });
      expect(isPublicProjection(p)).toBe(true);
      if (!isPublicProjection(p)) throw new Error('not public');
      expect(p.canonicalName).toBe('Kloel');
      expect(p.operationalAge.sinceGenesisDays).toBeGreaterThanOrEqual(7);
      expect(p.operationalAge.sinceFirstWorkspaceDays).toBeGreaterThanOrEqual(7);
      // Origin NEVER appears in public payload.
      const serialized = JSON.stringify(p);
      expect(serialized).not.toMatch(/etymology/i);
      expect(serialized).not.toMatch(/k(léos|leos)/i);
      expect(serialized).not.toMatch(/El\b.*Deus/i);
      expect(serialized).not.toMatch(/steward/i);
      expect(serialized).not.toMatch(/mordomo/i);
      expect(serialized).not.toMatch(/genesisEventId/i);
      expect(serialized).not.toMatch(/tailHash/i);
    });
  });

  describe('technical audience', () => {
    it('adds genesisEventId, tailSequenceNumber, tailHash, capabilityIds', async () => {
      const { projector } = await build();
      const p = await projector.project({
        audience: 'technical',
        capabilityIds: ['lineage', 'abi-builder'],
      });
      expect(isTechnicalProjection(p)).toBe(true);
      if (!isTechnicalProjection(p)) throw new Error('not technical');
      expect(p.genesisEventId).toBe('01JD90000000000000000000GE');
      expect(p.tailSequenceNumber).toBe(1);
      expect(p.tailHash).toMatch(/^[a-f0-9]{64}$/);
      expect(p.capabilityIds).toEqual(['lineage', 'abi-builder']);
    });

    it('does NOT include etymology / origin / steward', async () => {
      const { projector } = await build();
      const p = await projector.project({ audience: 'technical' });
      const serialized = JSON.stringify(p);
      expect(serialized).not.toMatch(/etymology/i);
      expect(serialized).not.toMatch(/kléos|kleos/i);
      expect(serialized).not.toMatch(/steward/i);
      expect(serialized).not.toMatch(/mordomo/i);
    });
  });

  describe('origin audience', () => {
    it('refuses without explicit originAuthorization', async () => {
      const { projector } = await build();
      const p = await projector.project({ audience: 'origin' });
      expect(isCompromisedProjection(p)).toBe(true);
      if (!isCompromisedProjection(p)) throw new Error('not compromised');
      expect(p.reason).toMatch(/auditable authorization/i);
      // Even on refusal, etymology never leaks.
      const serialized = JSON.stringify(p);
      expect(serialized).not.toMatch(/kléos|kleos/i);
    });

    it('exposes etymology + origin + steward when authorized', async () => {
      const { projector } = await build();
      const p = await projector.project({
        audience: 'origin',
        originAuthorization: { grantedAt: '2026-05-13T22:00:00.000Z', grantedBy: 'steward' },
      });
      expect(isOriginProjection(p)).toBe(true);
      if (!isOriginProjection(p)) throw new Error('not origin');
      expect(p.etymology.greek.word).toBe('kléos');
      expect(p.etymology.hebrew.word).toBe('El');
      expect(p.origin.inception).toBe('2026-05-13');
      expect(p.steward.role).toBe('humano-mordomo');
      expect(p.authorization.grantedBy).toBe('steward');
    });
  });

  describe('internal audience', () => {
    it('exposes everything plus entryCount', async () => {
      const { ledger, projector } = await build();
      await ledger.append({
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
      const p = await projector.project({ audience: 'internal' });
      expect(isInternalProjection(p)).toBe(true);
      if (!isInternalProjection(p)) throw new Error('not internal');
      expect(p.entryCount).toBe(2);
      expect(p.tailSequenceNumber).toBe(2);
      expect(p.etymology.greek.word).toBe('kléos');
    });
  });

  describe('compromised lineage', () => {
    it('returns compromised projection for each audience when ledger is broken', async () => {
      const { repo, projector } = await build();
      const internal = (repo as { entries: LineageEntry[] }).entries;
      internal[0] = { ...internal[0]!, hash: 'a'.repeat(64) };
      const audiences = ['public', 'technical', 'origin', 'internal'] as const;
      for (const audience of audiences) {
        const p = await projector.project({ audience });
        expect(isCompromisedProjection(p)).toBe(true);
        if (!isCompromisedProjection(p)) throw new Error('not compromised');
        // Even on compromise, canonicalName is still surfaced.
        expect(p.canonicalName).toBe('Kloel');
        // No origin material leaks in compromised projections.
        expect(JSON.stringify(p)).not.toMatch(/kléos|kleos/i);
      }
    });

    it('default operational age is 0 when no firstWorkspaceActivatedAt provided', async () => {
      const { projector } = await build();
      const p = await projector.project({
        audience: 'public',
        now: new Date('2026-05-13T20:30:00.000Z'),
      });
      if (!isPublicProjection(p)) throw new Error('not public');
      expect(p.operationalAge.sinceFirstWorkspaceDays).toBe(0);
    });
  });

  describe('cross-audience invariants', () => {
    it('canonicalName is identical across all audiences', async () => {
      const { projector } = await build();
      const auth = { grantedAt: '2026-05-13T22:00:00.000Z', grantedBy: 'steward' };
      const ps = await Promise.all([
        projector.project({ audience: 'public' }),
        projector.project({ audience: 'technical' }),
        projector.project({ audience: 'origin', originAuthorization: auth }),
        projector.project({ audience: 'internal' }),
      ]);
      for (const p of ps) {
        expect(p.canonicalName).toBe('Kloel');
      }
    });

    it('truthMode is always "observed" when projection succeeds', async () => {
      const { projector } = await build();
      const p = await projector.project({ audience: 'public' });
      if (!isPublicProjection(p)) throw new Error('not public');
      expect(p.truthMode).toBe('observed');
    });
  });
});
