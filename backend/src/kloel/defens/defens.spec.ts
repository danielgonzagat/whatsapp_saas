/**
 * UTP-DEFENS-001..009 — Defensibility Assets Spec
 *
 * Contract tests for Camada XXX defensibility layer: asset registry,
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
});

// ─── DEFENS-002: Growth Tracker ──────────────────────────────────────

describe('GrowthTracker (UTP-DEFENS-002)', () => {
  let tracker: GrowthTracker;

  beforeEach(() => {
    tracker = new GrowthTracker();
    tracker.resetHistory();
  });

  it('reports flat trend for no prior history', () => {
    const assets: DefensibleAsset[] = [{
      workspaceId: 'wks_a',
      assetId: 'asset_1',
      kind: 'owned_audience',
      label: 'Test Asset',
      strength: 'nascent',
      score: 0.3,
      firstRecordedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      evidence: [],
    }];
    const growth = tracker.track(assets, 30);
    expect(growth[0]?.trend).toBe('flat');
  });

  it('detects growth when score increases between periods', () => {
    const assets: DefensibleAsset[] = [{
      workspaceId: 'wks_a',
      assetId: 'asset_1',
      kind: 'owned_audience',
      label: 'Test Asset',
      strength: 'building',
      score: 0.5,
      firstRecordedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      evidence: [],
    }];
    tracker.track(assets, 30);

    const updatedAssets: DefensibleAsset[] = [{
      ...assets[0],
      score: 0.55,
      strength: 'building',
    }];
    const growth = tracker.track(updatedAssets, 30);
    expect(growth[0]?.trend).toBe('growing');
    expect(growth[0]?.growthRate).toBeGreaterThan(0);
  });

  it('detects declining trend when score drops', () => {
    const assets: DefensibleAsset[] = [{
      workspaceId: 'wks_a',
      assetId: 'asset_2',
      kind: 'social_proof',
      label: 'Test Proof',
      strength: 'established',
      score: 0.8,
      firstRecordedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      evidence: [],
    }];
    tracker.track(assets, 30);

    const updated: DefensibleAsset[] = [{
      ...assets[0],
      score: 0.4,
      strength: 'building',
    }];
    const growth = tracker.track(updated, 30);
    expect(growth[0]?.trend).toBe('declining');
    expect(growth[0]?.growthRate).toBeLessThan(0);
  });
});

// ─── DEFENS-003: Owned Audience Builder ──────────────────────────────

describe('OwnedAudienceBuilder (UTP-DEFENS-003)', () => {
  let builder: OwnedAudienceBuilder;

  beforeEach(() => {
    builder = new OwnedAudienceBuilder();
  });

  it('assigns high ownership to email channel', () => {
    const audience = builder.owned('wks_a', 'email', 1000, 0.3, 0.05, 0.1);
    expect(audience.ownershipLevel).toBeGreaterThan(0.8);
    expect(audience.platformRisk).toBeLessThan(0.2);
  });

  it('assigns low ownership to Instagram channel', () => {
    const audience = builder.owned('wks_a', 'instagram', 1000, 0.05, 0.01, 0.9);
    expect(audience.ownershipLevel).toBeLessThan(0.3);
  });

  it('computes defensibility score from audience list', () => {
    const audiences: OwnedAudience[] = [
      builder.owned('wks_a', 'email', 5000, 0.4, 0.1, 0.1),
      builder.owned('wks_a', 'instagram', 10000, 0.08, 0.02, 0.85),
    ];
    const score = builder.defScore(audiences);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('returns undefined topChannel for empty list', () => {
    expect(builder.topChannel([])).toBeUndefined();
  });

  it('identifies the most valuable owned channel', () => {
    const audiences: OwnedAudience[] = [
      builder.owned('wks_a', 'email', 5000, 0.4, 0.1, 0.1),
      builder.owned('wks_a', 'instagram', 10000, 0.08, 0.02, 0.85),
      builder.owned('wks_a', 'sms', 2000, 0.2, 0.05, 0.15),
    ];
    const top = builder.topChannel(audiences);
    expect(top?.channel).toBe('email');
  });
});

// ─── DEFENS-004: Social Proof Harvester ──────────────────────────────

describe('SocialProofHarvester (UTP-DEFENS-004)', () => {
  let harvester: SocialProofHarvester;

  beforeEach(() => {
    harvester = new SocialProofHarvester();
  });

  it('harvests numeric results from closed deals', () => {
    const events = makeDealWonEvents('wks_a', 2);
    const proofs = harvester.harvest(wsInput('wks_a', events));
    expect(proofs.length).toBeGreaterThan(0);
    expect(proofs.every((p) => p.kind === 'numeric_result')).toBe(true);
  });

  it('returns empty for workspace with no proof signals', () => {
    const events: SpineEventRef[] = [
      baseSpineEvent({ eventName: 'commerce.whatsapp.message_received', workspaceId: 'wks_a' }),
    ];
    const proofs = harvester.harvest(wsInput('wks_a', events));
    expect(proofs).toHaveLength(0);
  });

  it('aggregates proof stats', () => {
    harvester.harvest(wsInput('wks_a', makeDealWonEvents('wks_a', 3)));
    const agg = harvester.aggregate('wks_a');
    expect(agg.proofCount).toBe(3);
    expect(agg.avgCredibility).toBeGreaterThan(0);
    expect(agg.avgVisibility).toBeGreaterThan(0);
  });
});

// ─── DEFENS-005: Case Library Builder ────────────────────────────────

describe('CaseLibraryBuilder (UTP-DEFENS-005)', () => {
  let caseBuilder: CaseLibraryBuilder;

  beforeEach(() => {
    caseBuilder = new CaseLibraryBuilder();
  });

  it('builds cases from won deals', () => {
    const events = makeDealWonEvents('wks_a', 2);
    const cases = caseBuilder.build(wsInput('wks_a', events));
    expect(cases).toHaveLength(2);
    expect(cases[0]?.outcomeKind).toBe('revenue_growth');
  });

  it('ranks cases by reusability', () => {
    caseBuilder.build(wsInput('wks_a', makeDealWonEvents('wks_a', 5)));
    const top = caseBuilder.topReusable('wks_a', 3);
    expect(top.length).toBeLessThanOrEqual(3);
    if (top.length >= 2) {
      const a = top[0]?.reusabilityScore ?? 0;
      const b = top[1]?.reusabilityScore ?? 0;
      expect(a).toBeGreaterThanOrEqual(b);
    }
  });
});

// ─── DEFENS-006: Positioning Uniqueness Detector ─────────────────────

describe('PositioningUniquenessDetector (UTP-DEFENS-006)', () => {
  let detector: PositioningUniquenessDetector;

  beforeEach(() => {
    detector = new PositioningUniquenessDetector();
  });

  it('detects positioning signals from events', () => {
    const events: SpineEventRef[] = [
      baseSpineEvent({ eventName: 'commerce.lead.objection_raised', workspaceId: 'wks_a' }),
      baseSpineEvent({ eventName: 'commerce.lead.converted', workspaceId: 'wks_a' }),
    ];
    const signals = detector.detect(wsInput('wks_a', events));
    expect(signals.length).toBe(6);
    const premium = signals.find((s) => s.signalKind === 'price_premium');
    expect(premium?.strength).toBeGreaterThan(0);
  });

  it('computes overall uniqueness from all signals', () => {
    const events: SpineEventRef[] = Array.from({ length: 5 }, () =>
      baseSpineEvent({ eventName: 'commerce.crm.stage_changed', workspaceId: 'wks_a' }),
    );
    const signals = detector.detect(wsInput('wks_a', events));
    const uniqueness = detector.overallUniqueness(signals);
    expect(uniqueness).toBeGreaterThan(0);
    expect(uniqueness).toBeLessThanOrEqual(1);
  });

  it('returns zero uniqueness for empty workspace', () => {
    const signals = detector.detect(wsInput('wks_z', []));
    expect(detector.overallUniqueness(signals)).toBe(0);
  });
});

// ─── DEFENS-007: Authority Builder ───────────────────────────────────

describe('AuthorityBuilder (UTP-DEFENS-007)', () => {
  let builder: AuthorityBuilder;

  beforeEach(() => {
    builder = new AuthorityBuilder();
  });

  it('builds authority from campaign and member area events', () => {
    const events: SpineEventRef[] = [
      baseSpineEvent({ eventName: 'commerce.campaign.audience_reached', workspaceId: 'wks_a' }),
      baseSpineEvent({ eventName: 'commerce.member_area.enrolled', workspaceId: 'wks_a' }),
    ];
    const authorities = builder.build(wsInput('wks_a', events));
    expect(authorities.length).toBe(8);
  });

  it('computes overall authority score', () => {
    const events: SpineEventRef[] = Array.from({ length: 5 }, () =>
      baseSpineEvent({ eventName: 'commerce.campaign.creative_swapped', workspaceId: 'wks_a' }),
    );
    const authorities = builder.build(wsInput('wks_a', events));
    const score = builder.overallAuthority(authorities);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('all platforms present even when events are empty', () => {
    const authorities = builder.build(wsInput('wks_x', []));
    expect(authorities.length).toBe(8);
    expect(authorities.every((a) => a.contentCount === 0)).toBe(true);
  });
});

// ─── DEFENS-008: Tactical Tradeoff Advisor ───────────────────────────

describe('TacticalTradeoffAdvisor (UTP-DEFENS-008)', () => {
  let advisor: TacticalTradeoffAdvisor;

  beforeEach(() => {
    advisor = new TacticalTradeoffAdvisor();
  });

  it('flags strong tactical bias with low assets', () => {
    const result = advisor.advise('wks_a', [], 0.9);
    expect(result.tacticalScore).toBe('strongly_tactical');
    expect(result.atRiskAssets).toHaveLength(0);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it('reports balanced when assets and tactics are moderate', () => {
    const assets: DefensibleAsset[] = [{
      workspaceId: 'wks_a',
      assetId: 'a1',
      kind: 'owned_audience',
      label: 'Audience',
      strength: 'established',
      score: 0.55,
      firstRecordedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      evidence: [],
    }];
    const result = advisor.advise('wks_a', assets, 0.4);
    expect(['balanced', 'mostly_defensible']).toContain(result.tacticalScore);
  });

  it('identifies at-risk nascent assets', () => {
    const assets: DefensibleAsset[] = [{
      workspaceId: 'wks_a',
      assetId: 'a1',
      kind: 'owned_audience',
      label: 'Nascent',
      strength: 'nascent',
      score: 0.05,
      firstRecordedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      evidence: [],
    }];
    const result = advisor.advise('wks_a', assets, 0.7);
    expect(result.atRiskAssets).toContain('a1');
  });
});

// ─── DEFENS-009: Defensibility Narrative Builder ─────────────────────

describe('DefensibilityNarrativeBuilder (UTP-DEFENS-009)', () => {
  let narrativeBuilder: DefensibilityNarrativeBuilder;

  beforeEach(() => {
    narrativeBuilder = new DefensibilityNarrativeBuilder();
  });

  it('generates no-moat narrative for empty assets', () => {
    const narrative = narrativeBuilder.build('wks_a', [], [], [], []);
    expect(narrative.defensibilityScore).toBe(0);
    expect(narrative.moatType).toContain('No Moat');
    expect(narrative.narrativeText.length).toBeGreaterThan(0);
  });

  it('generates building-moat narrative with moderate assets', () => {
    const assets: DefensibleAsset[] = [{
      workspaceId: 'wks_a',
      assetId: 'a1',
      kind: 'owned_audience',
      label: 'Audience',
      strength: 'established',
      score: 0.6,
      firstRecordedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      evidence: [],
    }];
    const narrative = narrativeBuilder.build('wks_a', assets, [], [], []);
    expect(narrative.defensibilityScore).toBeGreaterThan(0);
    expect(narrative.topAssets.length).toBeGreaterThan(0);
  });

  it('computes composite score from all asset categories', () => {
    const assets: DefensibleAsset[] = [{
      workspaceId: 'wks_a',
      assetId: 'a1',
      kind: 'owned_audience',
      label: 'Audience',
      strength: 'established',
      score: 0.7,
      firstRecordedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      evidence: [],
    }];

    const positioning: PositioningUniqueness[] = [{
      workspaceId: 'wks_a',
      signalKind: 'unique_methodology',
      strength: 0.6,
      evidence: [],
      competitorOverlap: 0.2,
      assessedAt: new Date().toISOString(),
    }];

    const authorities: AuthorityBuilding[] = [{
      workspaceId: 'wks_a',
      platform: 'blog',
      contentCount: 10,
      consistencyScore: 0.7,
      reachScore: 0.5,
      depthScore: 0.6,
      assessedAt: new Date().toISOString(),
    }];

    const narrative = narrativeBuilder.build('wks_a', assets, positioning, authorities, []);
    expect(narrative.defensibilityScore).toBeGreaterThan(0.3);
    expect(narrative.defensibilityScore).toBeLessThanOrEqual(1);
    expect(narrative.summary.length).toBeGreaterThan(0);
    expect(narrative.narrativeText.length).toBeGreaterThan(20);
  });
});

// ─── DEFENS: Types and Utilities ─────────────────────────────────────

describe('Defens types and utilities', () => {
  it('assetStrengthFromScore maps correctly', async () => {
    const { assetStrengthFromScore } = await import('./types');
    expect(assetStrengthFromScore(0.8)).toBe('formidable');
    expect(assetStrengthFromScore(0.6)).toBe('established');
    expect(assetStrengthFromScore(0.3)).toBe('building');
    expect(assetStrengthFromScore(0.1)).toBe('nascent');
  });

  it('growthTrendFromRate maps correctly', async () => {
    const { growthTrendFromRate } = await import('./types');
    expect(growthTrendFromRate(0.3)).toBe('accelerating');
    expect(growthTrendFromRate(0.1)).toBe('growing');
    expect(growthTrendFromRate(0)).toBe('flat');
    expect(growthTrendFromRate(-0.1)).toBe('declining');
  });
});
