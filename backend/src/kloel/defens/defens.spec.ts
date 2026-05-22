/**
 * UTP-DEFENS-001..009 — Defensibility Assets Spec
 *
 * Contract tests for Camada 30 defensibility layer: asset registry,
 * growth tracking, owned audience building, social proof harvesting,
 * case library building, positioning uniqueness detection, authority
 * building, tactical-tradeoff advising, and defensibility narrative
 * construction.
 */

import { AssetRegistry } from './asset-registry';
import { GrowthTracker } from './growth-tracker';
import { OwnedAudienceBuilder } from './owned-audience.builder';
import { SocialProofHarvester } from './social-proof.harvester';
import { CaseLibraryBuilder } from './case-library.builder';
import { PositioningUniquenessDetector } from './positioning-uniqueness.detector';
import { AuthorityBuilder } from './authority.builder';
import { TacticalTradeoffAdvisor } from './tactical-tradeoff.advisor';
import { DefensibilityNarrativeBuilder } from './defensibility-narrative.builder';

import type { EvidenceInput, DefensibleAsset, OwnedAudience, PositioningUniqueness, AuthorityBuilding } from './types';
import type { SpineEventRef } from '../mind/mind.types';

const baseSpineEvent = (over: Partial<SpineEventRef> = {}): SpineEventRef => ({
  eventId: over.eventId ?? `evt_${Math.random().toString(36).slice(2, 8)}`,
  eventName: over.eventName ?? 'commerce.lead.replied',
  workspaceId: over.workspaceId ?? 'wks_demo',
  occurredAt: over.occurredAt ?? new Date().toISOString(),
  truthMode: over.truthMode ?? 'observed',
  ...(over.entityRef !== undefined ? { entityRef: over.entityRef } : {}),
  ...(over.valence !== undefined ? { valence: over.valence } : {}),
  ...(over.payload !== undefined ? { payload: over.payload } : {}),
});

const wsInput = (workspaceId: string, events: readonly SpineEventRef[]): EvidenceInput => ({
  events,
  workspaceId,
  nowMs: Date.now(),
});

const makeConversionEvents = (workspaceId: string, count: number): SpineEventRef[] =>
  Array.from({ length: count }, () =>
    baseSpineEvent({ eventName: 'commerce.lead.converted', workspaceId }),
  );

const makeDealWonEvents = (workspaceId: string, count: number): SpineEventRef[] =>
  Array.from({ length: count }, () =>
    baseSpineEvent({ eventName: 'commerce.crm.deal_won', workspaceId }),
  );

// ─── DEFENS-001: Asset Registry ──────────────────────────────────────

describe('AssetRegistry (UTP-DEFENS-001)', () => {
  let registry: AssetRegistry;

  beforeEach(() => {
    registry = new AssetRegistry();
  });

  it('returns empty list for workspace with no events', () => {
    const added = registry.register(wsInput('wks_a', []));
    expect(added).toHaveLength(0);
    expect(registry.count('wks_a')).toBe(0);
  });

  it('registers asset from commerce.lead.converted events', () => {
    const events = makeConversionEvents('wks_a', 1);
    const added = registry.register(wsInput('wks_a', events));
    expect(added.length).toBeGreaterThan(0);
    expect(added.some((a) => a.kind === 'switching_cost')).toBe(true);
  });

  it('accumulates score from repeat events', () => {
    const events = makeConversionEvents('wks_a', 3);
    const first = registry.register(wsInput('wks_a', events.slice(0, 1)));
    const all = registry.register(wsInput('wks_a', events));
    const firstScore = first[0]?.score ?? 0;
    const lastScore = all.length > 0 ? all[all.length - 1]?.score ?? 0 : 0;
    expect(lastScore).toBeGreaterThan(firstScore);
  });

  it('lists assets ordered by score descending', () => {
    const events = [
      ...makeDealWonEvents('wks_a', 5),
      ...makeConversionEvents('wks_a', 1),
    ];
    registry.register(wsInput('wks_a', events));
    const list = registry.list('wks_a');
    expect(list.length).toBeGreaterThan(0);
    for (let i = 0; i < list.length - 1; i++) {
      const thisScore = list[i]?.score ?? 0;
      const nextScore = list[i + 1]?.score ?? 0;
      expect(thisScore).toBeGreaterThanOrEqual(nextScore);
    }
  });

  it('isolates assets across workspaces', () => {
    registry.register(wsInput('wks_a', makeConversionEvents('wks_a', 3)));
    registry.register(wsInput('wks_b', makeDealWonEvents('wks_b', 1)));

    const listA = registry.list('wks_a');
    const listB = registry.list('wks_b');

    const hasSwitching = listA.some((a) => a.kind === 'switching_cost');
    const hasCase = listB.some((a) => a.kind === 'case_library');
    expect(hasSwitching).toBe(true);
    expect(hasCase).toBe(true);
    expect(registry.count('wks_a')).toBeGreaterThan(0);
    expect(registry.count('wks_b')).toBeGreaterThan(0);
  });

  it('returns nothing for unknown asset', () => {
    const asset = registry.get('wks_unknown', 'fake_id');
    expect(asset).toBeUndefined();
  });

  it('registers switching_cost from commerce.error.recovery_proof_packaged events', () => {
    const events: SpineEventRef[] = [
      baseSpineEvent({ eventName: 'commerce.error.recovery_proof_packaged', workspaceId: 'wks_a' }),
    ];
    const added = registry.register(wsInput('wks_a', events));
    expect(added.length).toBe(1);
    expect(added[0]?.kind).toBe('switching_cost');
    expect(added[0]?.label).toBe('Recovery Proof Trail');
    expect(added[0]?.strength).toBe('nascent');
    expect(added[0]?.evidence).toContain(events[0]?.eventId);
  });

  it('accumulates Recovery Proof Trail score from repeat events', () => {
    const events: SpineEventRef[] = Array.from({ length: 3 }, () =>
      baseSpineEvent({ eventName: 'commerce.error.recovery_proof_packaged', workspaceId: 'wks_a' }),
    );
    const all = registry.register(wsInput('wks_a', events));
    const asset = all[all.length - 1];
    expect(asset?.kind).toBe('switching_cost');
    expect(asset?.label).toBe('Recovery Proof Trail');
    expect(asset?.score).toBe(0.36);
  });

  it('registers switching_cost from matching cognition.valence_assigned events', () => {
    const events: SpineEventRef[] = [
      baseSpineEvent({
        eventName: 'cognition.valence_assigned',
        workspaceId: 'wks_a',
        entityRef: { entityType: 'operator', entityId: 'op_1' },
        payload: {
          accepted: false,
          operatorNote: 'Team lead override: this is not a performance failure',
          learningFraming: 'not human performance scoring - criterion refinement cycle',
        },
      }),
    ];
    const added = registry.register(wsInput('wks_a', events));
    expect(added.length).toBe(1);
    expect(added[0]?.kind).toBe('switching_cost');
    expect(added[0]?.label).toBe('Owner Criterion Memory');
    expect(added[0]?.strength).toBe('nascent');
    expect(added[0]?.evidence).toContain(events[0]?.eventId);
  });

  it('accumulates Owner Criterion Memory score from multiple matching valence_assigned events', () => {
    const makeEvent = (): SpineEventRef =>
      baseSpineEvent({
        eventName: 'cognition.valence_assigned',
        workspaceId: 'wks_a',
        entityRef: { entityType: 'operator', entityId: 'op_1' },
        payload: {
          accepted: false,
          operatorNote: 'Correction registered: not a scoring metric',
          learningFraming: 'not human performance scoring - team calibration',
        },
      });
    const all = registry.register(wsInput('wks_a', [makeEvent(), makeEvent(), makeEvent()]));
    const asset = all[all.length - 1];
    expect(asset?.kind).toBe('switching_cost');
    expect(asset?.label).toBe('Owner Criterion Memory');
    expect(asset?.score).toBeCloseTo(0.3, 6);
  });

  it('rejects cognition.valence_assigned when accepted is true', () => {
    const events: SpineEventRef[] = [
      baseSpineEvent({
        eventName: 'cognition.valence_assigned',
        workspaceId: 'wks_a',
        entityRef: { entityType: 'operator', entityId: 'op_1' },
        payload: {
          accepted: true,
          operatorNote: 'Looks fine',
          learningFraming: 'not human performance scoring',
        },
      }),
    ];
    const added = registry.register(wsInput('wks_a', events));
    expect(added).toHaveLength(0);
  });

  it('rejects cognition.valence_assigned when operatorNote is empty', () => {
    const events: SpineEventRef[] = [
      baseSpineEvent({
        eventName: 'cognition.valence_assigned',
        workspaceId: 'wks_a',
        entityRef: { entityType: 'operator', entityId: 'op_1' },
        payload: {
          accepted: false,
          operatorNote: '   ',
          learningFraming: 'not human performance scoring',
        },
      }),
    ];
    const added = registry.register(wsInput('wks_a', events));
    expect(added).toHaveLength(0);
  });

  it('rejects cognition.valence_assigned when learningFraming lacks the required phrase', () => {
    const events: SpineEventRef[] = [
      baseSpineEvent({
        eventName: 'cognition.valence_assigned',
        workspaceId: 'wks_a',
        entityRef: { entityType: 'operator', entityId: 'op_1' },
        payload: {
          accepted: false,
          operatorNote: 'This needs refinement',
          learningFraming: 'scoring adjustment for campaign',
        },
      }),
    ];
    const added = registry.register(wsInput('wks_a', events));
    expect(added).toHaveLength(0);
  });

  it('rejects cognition.valence_assigned without payload', () => {
    const events: SpineEventRef[] = [
      baseSpineEvent({ eventName: 'cognition.valence_assigned', workspaceId: 'wks_a' }),
    ];
    const added = registry.register(wsInput('wks_a', events));
    expect(added).toHaveLength(0);
  });

  it('ignores owner criterion memory without operator entityRef while preserving recovery proof', () => {
    const events: SpineEventRef[] = [
      baseSpineEvent({ eventName: 'commerce.error.recovery_proof_packaged', workspaceId: 'wks_a' }),
      baseSpineEvent({
        eventName: 'cognition.valence_assigned',
        workspaceId: 'wks_a',
        payload: {
          accepted: false,
          operatorNote: 'Criterion refinement event',
          learningFraming: 'not human performance scoring - context calibration',
        },
      }),
    ];
    const added = registry.register(wsInput('wks_a', events));
    expect(added).toHaveLength(1);
    expect(added[0]?.label).toBe('Recovery Proof Trail');
  });

  it('requires operator entityRef for owner criterion memory', () => {
    const events: SpineEventRef[] = [
      baseSpineEvent({
        eventName: 'cognition.valence_assigned',
        workspaceId: 'wks_a',
        entityRef: { entityType: 'lead', entityId: 'lead_1' },
        payload: {
          accepted: false,
          operatorNote: 'Criterion refinement event',
          learningFraming: 'not human performance scoring - context calibration',
        },
      }),
    ];
    const added = registry.register(wsInput('wks_a', events));
    expect(added).toHaveLength(0);
  });

  it('both new switching_cost assets coexist under the same workspace', () => {
    const events: SpineEventRef[] = [
      baseSpineEvent({ eventName: 'commerce.error.recovery_proof_packaged', workspaceId: 'wks_a' }),
      baseSpineEvent({
        eventName: 'cognition.valence_assigned',
        workspaceId: 'wks_a',
        entityRef: { entityType: 'operator', entityId: 'op_1' },
        payload: {
          accepted: false,
          operatorNote: 'Criterion refinement event',
          learningFraming: 'not human performance scoring - context calibration',
        },
      }),
    ];
    const added = registry.register(wsInput('wks_a', events));
    expect(added).toHaveLength(2);
    const labels = added.map((a) => a.label);
    expect(labels).toContain('Recovery Proof Trail');
    expect(labels).toContain('Owner Criterion Memory');
    const allSwitching = added.every((a) => a.kind === 'switching_cost');
    expect(allSwitching).toBe(true);
  });

  it('switching_cost assets remain emerging (nascent) with single event', () => {
    const recoveryEvents: SpineEventRef[] = [
      baseSpineEvent({ eventName: 'commerce.error.recovery_proof_packaged', workspaceId: 'wks_a' }),
    ];
    const criterionEvents: SpineEventRef[] = [
      baseSpineEvent({
        eventName: 'cognition.valence_assigned',
        workspaceId: 'wks_a',
        entityRef: { entityType: 'operator', entityId: 'op_1' },
        payload: {
          accepted: false,
          operatorNote: 'Criterion memory stored',
          learningFraming: 'not human performance scoring - owner calibration',
        },
      }),
    ];
    const recoveryAdded = registry.register(wsInput('wks_a', recoveryEvents));
    const criterionAdded = registry.register(wsInput('wks_a', criterionEvents));

    expect(recoveryAdded[0]?.strength).toBe('nascent');
    expect(criterionAdded[0]?.strength).toBe('nascent');

    const list = registry.list('wks_a');
    const switching = list.filter((a) => a.kind === 'switching_cost');
    expect(switching).toHaveLength(2);
  });
});

// ─── DEFENS-002: Growth Tracker ──────────────────────────────────────
