import { rankAttention } from './attention.ranker';
import { projectHierarchy } from './hierarchy.projector';
import { applyNoiseFilter } from './noise.filter';
import { detectAnxietyMode } from './anxiety-mode.detector';
import { applyFeedback } from './feedback.loop';
import { buildShortNarrative } from './short-narrative.builder';
import { clampScore } from './clarity.types';
import type {
  RankingInput,
  AttentionRanking,
  AnxietyMode,
  ClarityFeedback,
  AnxietyTrigger,
} from './clarity.types';

const NOW = Date.parse('2026-05-14T12:00:00.000Z');
const WKS = 'wks_clarity_test';

function makeItem(
  over?: Partial<RankingInput>,
): RankingInput {
  return {
    itemId: over?.itemId ?? 'it_test',
    workspaceId: over?.workspaceId ?? WKS,
    label: over?.label ?? 'Test item',
    urgency: over?.urgency ?? 0.5,
    impact: over?.impact ?? 0.5,
    reversibility: over?.reversibility ?? 0.5,
  };
}

function makeItemFull(
  itemId: string,
  label: string,
  urgency: number,
  impact: number,
  reversibility: number,
): RankingInput {
  return { itemId, workspaceId: WKS, label, urgency, impact, reversibility };
}

function makeAnxietyMode(
  over?: Partial<AnxietyMode>,
): AnxietyMode {
  return {
    active: over?.active ?? false,
    triggeredAt: over?.triggeredAt ?? null,
    triggerReason: over?.triggerReason ?? null,
    cooldownUntil: over?.cooldownUntil ?? null,
  };
}

function makeFeedback(
  over?: Partial<ClarityFeedback>,
): ClarityFeedback {
  return {
    feedbackId: over?.feedbackId ?? 'fb_test',
    itemId: over?.itemId ?? 'it_test',
    workspaceId: over?.workspaceId ?? WKS,
    rating: over?.rating ?? 0,
    comment: over?.comment ?? null,
    receivedAt: over?.receivedAt ?? new Date(NOW).toISOString(),
    appliedToRanking: over?.appliedToRanking ?? false,
  };
}

// =========================================================================
// CLARITY-001 — Attention Ranker
// =========================================================================
describe('CLARITY-006 — buildShortNarrative', () => {
  it('builds narrative from top items', () => {
    const rankings: AttentionRanking[] = [
      { itemId: 'a', workspaceId: WKS, label: 'Priority A', urgency: 1, impact: 1, reversibility: 0, score: 1, tier: 'AGORA', rankedAt: new Date(NOW).toISOString() },
      { itemId: 'b', workspaceId: WKS, label: 'Priority B', urgency: 0.8, impact: 0.8, reversibility: 0, score: 0.8, tier: 'AGORA', rankedAt: new Date(NOW).toISOString() },
    ];
    const mode = makeAnxietyMode();
    const narrative = buildShortNarrative({
      workspaceId: WKS,
      rankings,
      anxietyMode: mode,
      nowMs: NOW,
    });
    expect(narrative.message).toContain('Priority A');
    expect(narrative.message).toContain('Priority B');
    expect(narrative.anxietyActive).toBe(false);
  });

  it('shows anxiety prefix when anxiety mode is active', () => {
    const rankings: AttentionRanking[] = [
      { itemId: 'x', workspaceId: WKS, label: 'Crisis', urgency: 1, impact: 1, reversibility: 0, score: 1, tier: 'AGORA', rankedAt: new Date(NOW).toISOString() },
    ];
    const mode = makeAnxietyMode({ active: true });
    const narrative = buildShortNarrative({
      workspaceId: WKS,
      rankings,
      anxietyMode: mode,
      nowMs: NOW,
    });
    expect(narrative.message).toContain('[ANSIEDADE]');
    expect(narrative.anxietyActive).toBe(true);
    expect(narrative.topItems).toHaveLength(1);
  });

  it('filters non-AGORA items when anxiety is active', () => {
    const rankings: AttentionRanking[] = [
      { itemId: 'x', workspaceId: WKS, label: 'Urgent', urgency: 1, impact: 1, reversibility: 0, score: 1, tier: 'AGORA', rankedAt: new Date(NOW).toISOString() },
      { itemId: 'y', workspaceId: WKS, label: 'Later', urgency: 0.2, impact: 0.2, reversibility: 1, score: 0.1, tier: 'ARQUIVO', rankedAt: new Date(NOW).toISOString() },
    ];
    const mode = makeAnxietyMode({ active: true });
    const narrative = buildShortNarrative({
      workspaceId: WKS,
      rankings,
      anxietyMode: mode,
      nowMs: NOW,
    });
    expect(narrative.topItems).toHaveLength(1);
    expect(narrative.topItems[0]!.itemId).toBe('x');
  });

  it('returns default message for empty rankings', () => {
    const mode = makeAnxietyMode({ active: true });
    const narrative = buildShortNarrative({
      workspaceId: WKS,
      rankings: [],
      anxietyMode: mode,
      nowMs: NOW,
    });
    expect(narrative.message).toContain('ANSIEDADE');
    expect(narrative.topItems).toHaveLength(0);
  });

  it('limits narrative to max items', () => {
    const rankings: AttentionRanking[] = Array.from({ length: 10 }, (_, i) => ({
      itemId: `it_${i}`,
      workspaceId: WKS,
      label: `Item ${i}`,
      urgency: 1,
      impact: 1,
      reversibility: 0,
      score: 1,
      tier: 'AGORA' as const,
      rankedAt: new Date(NOW).toISOString(),
    }));
    const mode = makeAnxietyMode();
    const narrative = buildShortNarrative({
      workspaceId: WKS,
      rankings,
      anxietyMode: mode,
      nowMs: NOW,
    });
    expect(narrative.topItems.length).toBeLessThanOrEqual(3);
  });
});

// =========================================================================
// CLARITY — Utility functions
// =========================================================================
describe('CLARITY — utility functions', () => {
  it('clampScore bounds values to [0, 1]', () => {
    expect(clampScore(1.5)).toBe(1);
    expect(clampScore(-0.3)).toBe(0);
    expect(clampScore(0.5)).toBe(0.5);
  });
});
