import type { Prisma } from '@prisma/client';

import type { AnalysisResult } from './neuro-crm.types';

/**
 * Pure helpers extracted from NeuroCrmService.
 *
 * These functions hold business logic that was previously embedded inside
 * service methods — they have no side effects, no Prisma dependency and
 * no I/O. Extracting them keeps the service thin and makes the rules
 * unit-testable in isolation (lead score / recency decisions, cluster
 * projections, custom-field merge, sentiment-change insight rules).
 */

// ── Lead score / recency helpers ────────────────────────────────────────────

export type PurchaseProbabilityHint = string | null | undefined;
export type SentimentHint = string | null | undefined;

export interface NextBestActionInput {
  leadScore: number | null | undefined;
  sentiment: SentimentHint;
  purchaseProbability: PurchaseProbabilityHint;
  lastMessageAt: Date | null | undefined;
  /** Reference timestamp; defaults to `Date.now()`. Injected for testability. */
  now?: number;
}

export interface NextBestActionDecision {
  action: 'CLOSE_NOW' | 'CTA_PRECO' | 'TRATAR_OBJECAO' | 'REATIVAR' | 'FOLLOW_UP_SOFT';
  reason: string;
  lastMessageAtHours: number;
}

/** Hours since `lastMessageAt`; returns a safe sentinel when missing. */
export function hoursSinceLastMessage(
  lastMessageAt: Date | null | undefined,
  now: number = Date.now(),
): number {
  if (!lastMessageAt) {
    return 999;
  }
  return (now - lastMessageAt.getTime()) / 3_600_000;
}

/**
 * Decide the next best action purely from contact signals.
 *
 * Mirrors the previous inline rules:
 *   - hot lead (score > 70 or HIGH/VERY_HIGH probability) → CLOSE_NOW / CTA_PRECO
 *   - negative sentiment → TRATAR_OBJECAO
 *   - long silence (> 48h) → REATIVAR
 *   - otherwise → FOLLOW_UP_SOFT
 */
export function decideNextBestAction(input: NextBestActionInput): NextBestActionDecision {
  const hoursSince = hoursSinceLastMessage(input.lastMessageAt, input.now);
  const leadScore = input.leadScore ?? 0;
  const probability = input.purchaseProbability ?? null;

  let action: NextBestActionDecision['action'] = 'FOLLOW_UP_SOFT';
  let reason = 'contato sem atividade recente';

  if (leadScore > 70 || probability === 'HIGH' || probability === 'VERY_HIGH') {
    action = hoursSince > 12 ? 'CLOSE_NOW' : 'CTA_PRECO';
    reason = 'lead quente';
  } else if (input.sentiment === 'NEGATIVE') {
    action = 'TRATAR_OBJECAO';
    reason = 'sentimento negativo';
  } else if (hoursSince > 48) {
    action = 'REATIVAR';
    reason = 'silêncio longo';
  }

  return { action, reason, lastMessageAtHours: Math.round(hoursSince) };
}

// ── Cluster projection helpers (k-means) ────────────────────────────────────

export interface ContactProjection {
  id: string;
  name: string | null;
  phone: string;
  leadScore: number | null;
  updatedAt: Date;
}

export interface ClusterPoint {
  contact: {
    id: string;
    name: string | null;
    phone: string;
    leadScore: number;
    updatedAt: Date;
  };
  x: number;
  y: number;
}

export interface Centroid {
  x: number;
  y: number;
}

export interface ClusterAssignment {
  cluster: number;
  contact: ClusterPoint['contact'];
}

export interface ClusterResult {
  centroids: Centroid[];
  clusters: ClusterAssignment[];
}

/**
 * Project raw contact rows onto k-means feature space:
 *   x = leadScore (0-100), y = hours since `updatedAt`.
 *
 * Null lead scores are coerced to 0 so they fall into the "Cold" region.
 */
export function buildClusterPoints(
  contacts: ContactProjection[],
  now: number = Date.now(),
): ClusterPoint[] {
  return contacts.map((c) => ({
    contact: {
      id: c.id,
      name: c.name,
      phone: c.phone,
      leadScore: c.leadScore ?? 0,
      updatedAt: c.updatedAt,
    },
    x: c.leadScore ?? 0,
    y: (now - c.updatedAt.getTime()) / 3_600_000,
  }));
}

function nearestCentroid(point: { x: number; y: number }, centroids: Centroid[]): number {
  let best = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  centroids.forEach((c, idx) => {
    const d = Math.hypot(point.x - c.x, point.y - c.y);
    if (d < bestDist) {
      bestDist = d;
      best = idx;
    }
  });
  return best;
}

/**
 * Vanilla k-means with a fixed iteration budget. Pure function — given
 * the same inputs it always returns the same centroids. `k` is clamped
 * to `[1, points.length]` (or 0 when no points are provided).
 */
export function runKMeans(points: ClusterPoint[], desiredK = 3, iterations = 5): Centroid[] {
  if (points.length === 0) {
    return [];
  }
  const k = Math.min(desiredK, Math.max(1, points.length));
  let centroids: Centroid[] = points.slice(0, k).map((p) => ({ x: p.x, y: p.y }));

  for (let iter = 0; iter < iterations; iter += 1) {
    const buckets: ClusterPoint[][] = Array.from({ length: k }, () => []);
    for (const p of points) {
      const idx = nearestCentroid(p, centroids);
      const bucket = buckets[idx];
      if (bucket) {
        bucket.push(p);
      }
    }
    centroids = buckets.map((bucket, idx) => {
      if (!bucket.length) {
        const fallback = centroids[idx];
        return fallback ?? { x: 0, y: 0 };
      }
      const xSum = bucket.reduce((a, b) => a + b.x, 0);
      const ySum = bucket.reduce((a, b) => a + b.y, 0);
      return { x: xSum / bucket.length, y: ySum / bucket.length };
    });
  }

  return centroids;
}

/**
 * Assign each cluster point to its nearest centroid, returning the
 * shape consumed by the controller.
 */
export function assignClusters(points: ClusterPoint[], centroids: Centroid[]): ClusterAssignment[] {
  return points.map((p) => ({
    cluster: nearestCentroid(p, centroids),
    contact: p.contact,
  }));
}

/** End-to-end clustering: project → k-means → assign. Pure. */
export function clusterContactProjections(
  contacts: ContactProjection[],
  desiredK = 3,
  iterations = 5,
  now: number = Date.now(),
): ClusterResult {
  const points = buildClusterPoints(contacts, now);
  const centroids = runKMeans(points, desiredK, iterations);
  return { centroids, clusters: assignClusters(points, centroids) };
}

// ── Custom-fields merge (Prisma JSON dedup) ─────────────────────────────────

export interface NeuroCrmCustomFieldsPatch {
  leadScore: number;
  purchaseProbability: string;
  purchaseProbabilityScore: number;
  sentiment: string;
  intent: string;
  summary: string;
  nextBestAction: string;
  cluster?: string | null;
  reasons?: string[];
}

/**
 * Sanitise an existing `customFields` value into a plain JSON object,
 * dropping arrays and primitives that would corrupt the contact row.
 *
 * Acts as a "dedup-by-key" guard so that the AI patch always overwrites
 * known keys without losing unrelated CRM fields the operator may have
 * stored manually.
 */
export function sanitizeCustomFieldsBase(
  current: Prisma.JsonValue | null | undefined,
): Prisma.JsonObject {
  if (current && typeof current === 'object' && !Array.isArray(current)) {
    return current;
  }
  return {};
}

/**
 * Merge the latest neuro-CRM analysis into the contact's `customFields`
 * JSON. Pure — no `Date.now()` unless `now` is omitted (defaults to
 * `new Date().toISOString()` at call time).
 */
export function mergeNeuroCrmCustomFields(
  current: Prisma.JsonValue | null | undefined,
  patch: NeuroCrmCustomFieldsPatch,
  now: Date = new Date(),
): Prisma.InputJsonObject {
  const base = sanitizeCustomFieldsBase(current);
  return {
    ...base,
    purchaseProbabilityScore: patch.purchaseProbabilityScore,
    probabilityReasons: patch.reasons ?? [],
    intent: patch.intent,
    cluster: patch.cluster ?? null,
    lastNeuroCrmAnalysisAt: now.toISOString(),
  } satisfies Prisma.InputJsonObject;
}

// ── Sentiment-change insight rule ──────────────────────────────────────────

export interface SentimentChangeInsight {
  description: string;
  scoreChange: number;
}

/**
 * Decide whether the sentiment transition between the previous contact
 * snapshot and the new AI result deserves a `SENTIMENT_CHANGE` insight,
 * and produce its payload. Returns `null` when there is no change.
 */
export function deriveSentimentChangeInsight(
  previousSentiment: SentimentHint,
  result: Pick<AnalysisResult, 'sentiment'>,
): SentimentChangeInsight | null {
  const oldSentiment = previousSentiment || 'NEUTRAL';
  if (oldSentiment === result.sentiment) {
    return null;
  }

  const description =
    result.sentiment === 'POSITIVE'
      ? `Sentimento melhorou de ${oldSentiment} para POSITIVE`
      : result.sentiment === 'NEGATIVE'
        ? `Sentimento piorou de ${oldSentiment} para NEGATIVE`
        : `Sentimento neutralizou para ${result.sentiment}`;

  const scoreChange =
    result.sentiment === 'POSITIVE' ? 5 : result.sentiment === 'NEGATIVE' ? -5 : 0;

  return { description, scoreChange };
}

/**
 * Detect whether the AI analysis surfaces an objection that should
 * trigger an `OBJECTION_RAISED` insight. Returns the objection kind or
 * `null` when no objection signal is present.
 */
export function detectObjectionKind(
  result: Pick<AnalysisResult, 'intent' | 'sentiment'>,
): 'complaint' | 'negative_sentiment' | null {
  if (result.intent === 'COMPLAINT') {
    return 'complaint';
  }
  if (result.sentiment === 'NEGATIVE') {
    return 'negative_sentiment';
  }
  return null;
}
