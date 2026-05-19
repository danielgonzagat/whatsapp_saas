import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AbiBuilderService } from '../abi/abi-builder.service';
import { GoalFieldService } from '../goal-field/goal-field.service';
import { IdentityProjectorService } from '../lineage/identity-projector.service';
import { LineageGuardService } from '../lineage/lineage-guard.service';
import {
  InMemoryLineageLedgerRepository,
  LineageLedgerService,
} from '../lineage/lineage-ledger.service';
import { HebbianService } from '../mind/hebbian.service';
import { ConsolidationService } from '../mind/consolidation.service';
import { MindBackgroundProcessor } from '../mind/mind-bg.processor';
import { MultiTimescaleCoordinator } from '../mind/multi-timescale.coordinator';
import { ValenceAggregatorService } from '../mind/valence-aggregator.service';
import { ValenceTaggerService } from '../mind/valence-tagger.service';
import { SpineEmitterService } from '../spine/spine-emitter.service';
import { VtierCertifierService } from './v-tier-certifier.service';
import { VerificationVerdict } from './v-tier.types';
import type { SpineEventRef } from '../mind/mind.types';

function ev(over: Partial<SpineEventRef> = {}): SpineEventRef {
  return {
    eventId: over.eventId ?? `evt_${randomUUID()}`,
    eventName: over.eventName ?? 'commerce.lead.replied',
    workspaceId: over.workspaceId ?? 'wks_test',
    occurredAt: over.occurredAt ?? new Date().toISOString(),
    truthMode: over.truthMode ?? 'observed',
    ...(over.entityRef !== undefined ? { entityRef: over.entityRef } : {}),
    ...(over.valence !== undefined ? { valence: over.valence } : {}),
    ...(over.payload !== undefined ? { payload: over.payload } : {}),
    ...(over.correlationId !== undefined
      ? { correlationId: over.correlationId }
      : {}),
  };
}

function makeCertifier(over: {
  readonly spine?: SpineEmitterService;
  readonly workspaceCount?: number;
} = {}): VtierCertifierService {
  const repo = new InMemoryLineageLedgerRepository();
  const ledger = new LineageLedgerService(repo);
  const guard = new LineageGuardService(repo);
  const projector = new IdentityProjectorService(guard);
  const spine =
    over.spine ?? new SpineEmitterService(new ValenceTaggerService());
  const abiBuilder = new AbiBuilderService(projector);
  const valenceTagger = new ValenceTaggerService();
  const hebbian = new HebbianService();
  const goalField = new GoalFieldService();
  const coordinator = new MultiTimescaleCoordinator();
  const valenceAgg = new ValenceAggregatorService();
  const consolidation = new ConsolidationService();
  const mindBg = new MindBackgroundProcessor(
    coordinator,
    valenceAgg,
    hebbian,
    consolidation,
  );
  return new VtierCertifierService(
    spine,
    guard,
    abiBuilder,
    valenceTagger,
    hebbian,
    goalField,
    projector,
    mindBg,
  );
}

function expectStatus(
  v: VerificationVerdict,
  expected: VerificationVerdict['status'],
): void {
  expect(v.status).toBe(expected);
}

describe('VtierCertifierService', () => {
  describe('V16 — remoção degrada cognição', () => {
    it('always PASS', async () => {
      const c = makeCertifier();
      const result = await c.certify();
      const v16 = result.verdicts.find((v) => v.criterionId === 'V16')!;
      expectStatus(v16, 'PASS');
    });
  });

  describe('certify() aggregate', () => {
    it('returns all 16 verdicts', async () => {
      const c = makeCertifier();
      const result = await c.certify();
      expect(result.verdicts).toHaveLength(16);
    });

    it('has passCount + failCount + insufficientEvidenceCount == 16', async () => {
      const c = makeCertifier();
      const result = await c.certify();
      expect(
        result.passCount + result.failCount + result.insufficientEvidenceCount,
      ).toBe(16);
    });

    it('overall is a valid VtierOverall value', async () => {
      const repo = new InMemoryLineageLedgerRepository();
      await new LineageLedgerService(repo).bootstrapGenesis();
      const c = makeCertifier();
      const result = await c.certify({ workspaceCount: 0 });
      expect(['PASS', 'PARTIAL', 'FAIL']).toContain(result.overall);
      expect(
        result.passCount + result.failCount + result.insufficientEvidenceCount,
      ).toBe(16);
    });

    it('certificationId is a non-empty string', async () => {
      const c = makeCertifier();
      const result = await c.certify();
      expect(result.certificationId).toBeTruthy();
      expect(typeof result.certificationId).toBe('string');
    });
  });
});
