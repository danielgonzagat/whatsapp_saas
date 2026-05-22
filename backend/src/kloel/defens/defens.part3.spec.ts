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
    expect(narrative.narrativeText).toContain('Switching-cost proof is not yet established');
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

  it('keeps replacement pain honest when switching-cost evidence is still partial', () => {
    const assets: DefensibleAsset[] = [{
      workspaceId: 'wks_a',
      assetId: 'switching_1',
      kind: 'switching_cost',
      label: 'Conversion Track Record',
      strength: 'building',
      score: 0.32,
      firstRecordedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      evidence: ['evt_conversion_1', 'evt_conversion_2'],
    }];

    const narrative = narrativeBuilder.build('wks_a', assets, [], [], []);

    expect(narrative.narrativeText).toContain('Replacement pain is emerging');
    expect(narrative.narrativeText).toContain('Conversion Track Record');
    expect(narrative.narrativeText).toContain('generic SaaS');
    expect(narrative.replacementPain).toHaveLength(5);
    expect(narrative.replacementPain).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ dimension: 'memory', evidenceLevel: 'emerging' }),
        expect.objectContaining({ dimension: 'context', evidenceLevel: 'emerging' }),
        expect.objectContaining({ dimension: 'criterion', evidenceLevel: 'not_yet_proven' }),
        expect.objectContaining({ dimension: 'judgment', evidenceLevel: 'not_yet_proven' }),
        expect.objectContaining({ dimension: 'commercial_capital', evidenceLevel: 'not_yet_proven' }),
      ]),
    );
    expect(narrative.replacementPainNarrative).toContain('commercial capital remains not_yet_proven');
    expect(narrative.switchingCostReasoning).toContain('Emerging switching-cost evidence');
  });

  it('requires compounded evidence families before commercial capital becomes replacement pain', () => {
    const now = new Date().toISOString();
    const assets: DefensibleAsset[] = [
      {
        workspaceId: 'wks_a',
        assetId: 'switching_conversion',
        kind: 'switching_cost',
        label: 'Conversion Track Record',
        strength: 'established',
        score: 0.7,
        firstRecordedAt: now,
        lastUpdatedAt: now,
        evidence: ['evt_conversion_1', 'evt_conversion_2'],
      },
      {
        workspaceId: 'wks_a',
        assetId: 'switching_recovery',
        kind: 'switching_cost',
        label: 'Recovery Proof Trail',
        strength: 'building',
        score: 0.5,
        firstRecordedAt: now,
        lastUpdatedAt: now,
        evidence: ['evt_recovery_1', 'evt_recovery_2'],
      },
      {
        workspaceId: 'wks_a',
        assetId: 'switching_criterion',
        kind: 'switching_cost',
        label: 'Owner Criterion Memory',
        strength: 'building',
        score: 0.4,
        firstRecordedAt: now,
        lastUpdatedAt: now,
        evidence: ['evt_criterion_1'],
      },
    ];

    const narrative = narrativeBuilder.build('wks_a', assets, [], [], []);

    expect(narrative.replacementPain).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ dimension: 'memory', evidenceLevel: 'emerging' }),
        expect.objectContaining({ dimension: 'criterion', evidenceLevel: 'emerging' }),
        expect.objectContaining({ dimension: 'context', evidenceLevel: 'emerging' }),
        expect.objectContaining({ dimension: 'judgment', evidenceLevel: 'emerging' }),
        expect.objectContaining({ dimension: 'commercial_capital', evidenceLevel: 'emerging' }),
      ]),
    );
    expect(narrative.replacementPainNarrative).toContain('commercial capital remains emerging');
    expect(narrative.switchingCostReasoning).toContain('only evidenced dimensions');
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
