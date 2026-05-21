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
describe('CLARITY-001 — rankAttention', () => {
  it('ranks items by urgency * impact * reversibility penalty', () => {
    const items: RankingInput[] = [
      makeItemFull('a', 'High all', 1, 1, 0),
      makeItemFull('b', 'Medium', 0.5, 0.5, 0.5),
      makeItemFull('c', 'Low all', 0.1, 0.1, 1),
    ];
    const result = rankAttention(items, NOW);
    expect(result.rankings).toHaveLength(3);
    expect(result.rankings[0]!.itemId).toBe('a');
    expect(result.rankings[2]!.itemId).toBe('c');
    expect(result.topItem?.itemId).toBe('a');
  });

  it('higher reversibility reduces score (safer decisions rank lower)', () => {
    const irreversible = makeItemFull('irr', 'Irreversible', 0.9, 0.9, 0);
    const reversible = makeItemFull('rev', 'Reversible', 0.9, 0.9, 1);
    const result = rankAttention([irreversible, reversible], NOW);
    expect(result.rankings[0]!.itemId).toBe('irr');
    expect(result.rankings[0]!.score).toBeGreaterThan(result.rankings[1]!.score);
  });

  it('returns null topItem for empty input', () => {
    const result = rankAttention([], NOW);
    expect(result.rankings).toHaveLength(0);
    expect(result.topItem).toBeNull();
  });

  it('assigns AGORA tier for score >= 0.75', () => {
    const items = [makeItemFull('x', 'Urgent', 1, 1, 0)];
    const result = rankAttention(items, NOW);
    expect(result.rankings[0]!.tier).toBe('AGORA');
    expect(result.rankings[0]!.score).toBeGreaterThanOrEqual(0.75);
  });

  it('assigns ARQUIVO tier for score < 0.25', () => {
    const items = [makeItemFull('y', 'Trivial', 0.05, 0.05, 1)];
    const result = rankAttention(items, NOW);
    expect(result.rankings[0]!.tier).toBe('ARQUIVO');
    expect(result.rankings[0]!.score).toBeLessThan(0.25);
  });
});

// =========================================================================
// CLARITY-002 — Hierarchy Projector
// =========================================================================
describe('CLARITY-002 — projectHierarchy', () => {
  it('projects items into correct tier buckets', () => {
    const rankings: AttentionRanking[] = [
      { itemId: 'a', workspaceId: WKS, label: 'A', urgency: 1, impact: 1, reversibility: 0, score: 1, tier: 'AGORA', rankedAt: new Date(NOW).toISOString() },
      { itemId: 'b', workspaceId: WKS, label: 'B', urgency: 0.5, impact: 0.5, reversibility: 0.5, score: 0.5, tier: 'ESTA_SEMANA', rankedAt: new Date(NOW).toISOString() },
      { itemId: 'c', workspaceId: WKS, label: 'C', urgency: 0.2, impact: 0.2, reversibility: 1, score: 0.1, tier: 'ARQUIVO', rankedAt: new Date(NOW).toISOString() },
    ];
    const proj = projectHierarchy({ rankings });
    expect(proj.agoralCount).toBe(1);
    expect(proj.estaSemanaCount).toBe(1);
    expect(proj.paraSaberCount).toBe(0);
    expect(proj.arquivoCount).toBe(1);
    expect(proj.totalItems).toBe(3);
    expect(proj.projections).toHaveLength(4);
  });

  it('handles empty rankings', () => {
    const proj = projectHierarchy({ rankings: [] });
    expect(proj.totalItems).toBe(0);
    expect(proj.projections.every((p) => p.count === 0)).toBe(true);
  });
});

// =========================================================================
// CLARITY-003 — Noise Filter
// =========================================================================
describe('CLARITY-003 — applyNoiseFilter', () => {
  it('silently drops items below threshold', () => {
    const rankings: AttentionRanking[] = [
      { itemId: 'a', workspaceId: WKS, label: 'A', urgency: 1, impact: 1, reversibility: 0, score: 1, tier: 'AGORA', rankedAt: new Date(NOW).toISOString() },
      { itemId: 'b', workspaceId: WKS, label: 'B', urgency: 0.1, impact: 0.1, reversibility: 1, score: 0.05, tier: 'ARQUIVO', rankedAt: new Date(NOW).toISOString() },
    ];
    const result = applyNoiseFilter({
      rankings,
      threshold: 0.3,
      silent: true,
      nowMs: NOW,
    });
    expect(result.kept).toHaveLength(1);
    expect(result.kept[0]!.itemId).toBe('a');
    expect(result.filtered).toHaveLength(1);
    expect(result.filter.silent).toBe(true);
    expect(result.filter.filteredCount).toBe(1);
    expect(result.filter.totalCount).toBe(2);
  });

  it('keeps all items when silent is false', () => {
    const rankings: AttentionRanking[] = [
      { itemId: 'a', workspaceId: WKS, label: 'A', urgency: 1, impact: 1, reversibility: 0, score: 1, tier: 'AGORA', rankedAt: new Date(NOW).toISOString() },
      { itemId: 'b', workspaceId: WKS, label: 'B', urgency: 0.1, impact: 0.1, reversibility: 1, score: 0.05, tier: 'ARQUIVO', rankedAt: new Date(NOW).toISOString() },
    ];
    const result = applyNoiseFilter({
      rankings,
      threshold: 0.3,
      silent: false,
      nowMs: NOW,
    });
    expect(result.kept).toHaveLength(2);
    expect(result.filtered).toHaveLength(1);
  });

  it('uses default threshold when input is zero', () => {
    const rankings: AttentionRanking[] = [
      { itemId: 'a', workspaceId: WKS, label: 'A', urgency: 1, impact: 1, reversibility: 0, score: 0.2, tier: 'PARA_SABER', rankedAt: new Date(NOW).toISOString() },
    ];
    const result = applyNoiseFilter({
      rankings,
      threshold: 0,
      silent: true,
      nowMs: NOW,
    });
    expect(result.filter.threshold).toBeGreaterThan(0);
  });
});

// =========================================================================
// CLARITY-004 — Anxiety Mode Detector
// =========================================================================
describe('CLARITY-004 — detectAnxietyMode', () => {
  it('activates anxiety when 2+ triggers fire', () => {
    const trigger: AnxietyTrigger = {
      workspaceId: WKS,
      overloadFactor: 0.8,
      urgentItemCount: 6,
      decisionBacklog: 3,
      nowMs: NOW,
    };
    const current = makeAnxietyMode();
    const detection = detectAnxietyMode(trigger, current);
    expect(detection.shouldActivate).toBe(true);
    expect(detection.mode.active).toBe(true);
    expect(detection.reasons.length).toBeGreaterThanOrEqual(2);
  });

  it('does not activate with only one trigger', () => {
    const trigger: AnxietyTrigger = {
      workspaceId: WKS,
      overloadFactor: 0.8,
      urgentItemCount: 2,
      decisionBacklog: 3,
      nowMs: NOW,
    };
    const current = makeAnxietyMode();
    const detection = detectAnxietyMode(trigger, current);
    expect(detection.shouldActivate).toBe(false);
    expect(detection.mode.active).toBe(false);
  });

  it('deactivates when cooldown expires', () => {
    const pastMs = NOW - 60 * 60 * 1000;
    const current: AnxietyMode = {
      active: true,
      triggeredAt: new Date(pastMs - 60 * 60 * 1000).toISOString(),
      triggerReason: 'overload',
      cooldownUntil: new Date(NOW - 1).toISOString(),
    };
    const trigger: AnxietyTrigger = {
      workspaceId: WKS,
      overloadFactor: 0.5,
      urgentItemCount: 1,
      decisionBacklog: 2,
      nowMs: NOW,
    };
    const detection = detectAnxietyMode(trigger, current);
    expect(detection.shouldDeactivate).toBe(true);
    expect(detection.mode.active).toBe(false);
  });

  it('deactivates when all metrics are below thresholds', () => {
    const current: AnxietyMode = {
      active: true,
      triggeredAt: new Date(NOW - 10 * 60 * 1000).toISOString(),
      triggerReason: 'overload',
      cooldownUntil: new Date(NOW + 60 * 60 * 1000).toISOString(),
    };
    const trigger: AnxietyTrigger = {
      workspaceId: WKS,
      overloadFactor: 0.3,
      urgentItemCount: 1,
      decisionBacklog: 4,
      nowMs: NOW,
    };
    const detection = detectAnxietyMode(trigger, current);
    expect(detection.shouldDeactivate).toBe(true);
    expect(detection.mode.active).toBe(false);
  });
});

// =========================================================================
// CLARITY-005 — Feedback Loop
// =========================================================================
describe('CLARITY-005 — applyFeedback', () => {
  it('boosts item score on positive feedback', () => {
    const rankings: AttentionRanking[] = [
      { itemId: 'it_a', workspaceId: WKS, label: 'A', urgency: 0.5, impact: 0.5, reversibility: 0.5, score: 0.5, tier: 'ESTA_SEMANA', rankedAt: new Date(NOW).toISOString() },
    ];
    const feedback = makeFeedback({ rating: 1, itemId: 'it_a' });
    const result = applyFeedback({ feedback, rankings, nowMs: NOW });
    expect(result.rankings[0]!.score).toBeGreaterThan(0.5);
    expect(result.scoreDelta).toBeGreaterThan(0);
    expect(result.feedback.appliedToRanking).toBe(true);
  });

  it('penalizes item score on negative feedback', () => {
    const rankings: AttentionRanking[] = [
      { itemId: 'it_a', workspaceId: WKS, label: 'A', urgency: 0.5, impact: 0.5, reversibility: 0.5, score: 0.5, tier: 'ESTA_SEMANA', rankedAt: new Date(NOW).toISOString() },
    ];
    const feedback = makeFeedback({ rating: -1, itemId: 'it_a' });
    const result = applyFeedback({ feedback, rankings, nowMs: NOW });
    expect(result.rankings[0]!.score).toBeLessThan(0.5);
    expect(result.scoreDelta).toBeLessThan(0);
  });

  it('does not change score on neutral feedback', () => {
    const rankings: AttentionRanking[] = [
      { itemId: 'it_a', workspaceId: WKS, label: 'A', urgency: 0.5, impact: 0.5, reversibility: 0.5, score: 0.5, tier: 'ESTA_SEMANA', rankedAt: new Date(NOW).toISOString() },
    ];
    const feedback = makeFeedback({ rating: 0, itemId: 'it_a' });
    const result = applyFeedback({ feedback, rankings, nowMs: NOW });
    expect(result.rankings[0]!.score).toBe(0.5);
    expect(result.scoreDelta).toBe(0);
  });

  it('leaves other items unchanged', () => {
    const rankings: AttentionRanking[] = [
      { itemId: 'it_a', workspaceId: WKS, label: 'A', urgency: 0.5, impact: 0.5, reversibility: 0.5, score: 0.5, tier: 'ESTA_SEMANA', rankedAt: new Date(NOW).toISOString() },
      { itemId: 'it_b', workspaceId: WKS, label: 'B', urgency: 0.5, impact: 0.5, reversibility: 0.5, score: 0.5, tier: 'ESTA_SEMANA', rankedAt: new Date(NOW).toISOString() },
    ];
    const feedback = makeFeedback({ rating: 1, itemId: 'it_a' });
    const result = applyFeedback({ feedback, rankings, nowMs: NOW });
    expect(result.rankings[1]!.score).toBe(0.5);
  });
});

// =========================================================================
// CLARITY-006 — Short Narrative Builder
// =========================================================================