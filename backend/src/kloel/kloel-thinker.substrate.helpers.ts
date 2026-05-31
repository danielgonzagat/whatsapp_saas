/**
 * Pure helpers extracted from KloelThinkerService (`thinkSyncImpl`) for the
 * cognitive-substrate build path.
 *
 * The sync think loop must hand the LLM a prebuilt `prebuiltCognitiveState`
 * shaped from recent `RAC_AutopilotEvent` rows so the chat has cross-session
 * memory even when the DI-injected ABI builder is unavailable. Everything
 * downstream of the raw DB read is pure transformation — extracting it lets
 * the math be exhaustively unit-tested without booting the Nest container or
 * mocking Prisma.
 *
 * Mirror file names so a reader can grep `RAC_AutopilotEvent` and land on
 * either side (DB shape) or this helper (in-memory shape).
 */
import { buildTimestampedRuntimeId } from './kloel-id.util';

/** Hard caps used by the substrate builder. */
export const SUBSTRATE_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
export const SUBSTRATE_EVENT_LIMIT = 500;
export const SUBSTRATE_SALIENT_HEAD = 30;
export const SUBSTRATE_WORKING_MEMORY_TAIL = 5;
export const SUBSTRATE_EPISODIC_TAIL = 10;
export const SUBSTRATE_VALENCE_TRACE_TAIL = 20;
export const SUBSTRATE_ATTENTION_TAIL = 3;
export const SUBSTRATE_USER_PREVIEW_CHARS = 120;
export const SUBSTRATE_BELIEF_MIN_OBSERVATIONS = 3;
export const SUBSTRATE_HEALTH_DIVISOR = 10;
export const SUBSTRATE_HEALTH_CAP = 10;
export const SUBSTRATE_DEVELOPING_THRESHOLD = 20;
export const SUBSTRATE_PREDICTION_MIN_EVENTS = 5;
export const SUBSTRATE_BELIEF_EXAMPLES_CAP = 3;
export const SUBSTRATE_VALENCE_DEFAULT_SCORE = 0.1;

/** Shape of a raw RAC_AutopilotEvent row from the spine. */
export interface AutopilotEventRow {
  intent: string;
  action: string;
  status: string;
  meta: unknown;
  createdAt: Date | string;
}

/** In-memory event shape consumed by the substrate builder. */
export interface NormalizedSpineEvent {
  eventId: string;
  eventName: string;
  occurredAt: string;
  summary: string;
  valence: 'neutral';
}

export interface SubstrateBelief {
  predicate: string;
  confidence: number;
  n: number;
  lastObserved: string;
  examples: string[];
}

export interface SubstratePulseTruthGate {
  name: string;
  status: 'PASS' | 'FAIL';
}

export interface SubstratePulseTruth {
  noOverclaimStatus: 'PASS';
  capabilityHealthScore: number;
  gates: SubstratePulseTruthGate[];
  certificationVerdict: {
    verdict: 'DEVELOPING' | 'INSUFFICIENT_EVIDENCE';
    score: number;
    measuredAt: string;
  };
  overclaimRisk: number;
}

export interface SubstrateValenceTracePoint {
  score: number;
  label: string;
  at: string;
}

/** Final, prompt-ready cognitive substrate. */
export interface CognitiveSubstrate {
  recentSalientEvents: NormalizedSpineEvent[];
  beliefs: SubstrateBelief[];
  predictions: {
    active: Array<{ label: string; baseRate: number; confidence: number }>;
    recentSurprises: unknown[];
  };
  valence: {
    recentTrace: SubstrateValenceTracePoint[];
    aggregatedMood: {
      positive: number;
      negative: number;
      neutral: number;
      ambiguous: number;
      windowHours: number;
    };
  };
  workingMemory: string[];
  episodicRefs: Array<{ ref: string; summary: string; occurredAt: string }>;
  consolidatedRefs: unknown[];
  pulseTruth: SubstratePulseTruth;
  attention: {
    candidates: Array<{ label: string; recency: number; valence: number }>;
  };
  perception: {
    currentSnapshot: { channel: 'web'; workspaceId: string };
    recentSalientEvents: NormalizedSpineEvent[];
  };
  capabilityHealthScore: number;
}

/**
 * Return the lookback `Date` for the spine query — kept pure so tests can
 * pin `now` and assert the exact ISO string without mocking the clock.
 */
export function computeSubstrateLookbackSince(now: Date = new Date()): Date {
  return new Date(now.getTime() - SUBSTRATE_LOOKBACK_MS);
}

/**
 * Extract `meta.userPreview` defensively. Any non-string / non-object meta is
 * coerced to `''` so downstream `.slice(...)` is safe.
 */
export function extractUserPreview(meta: unknown): string {
  if (typeof meta !== 'object' || meta === null) {
    return '';
  }
  const record = meta as Record<string, unknown>;
  return typeof record['userPreview'] === 'string' ? record['userPreview'] : '';
}

/**
 * Normalize a single raw `AutopilotEventRow` into the in-memory shape used by
 * the substrate. The `index` ensures deterministic ordering when two events
 * share the same `createdAt`.
 */
export function normalizeSpineEvent(row: AutopilotEventRow, index: number): NormalizedSpineEvent {
  const occurredAtIso = new Date(row.createdAt).toISOString();
  const occurredAtMs = new Date(row.createdAt).getTime();
  const userPreview = extractUserPreview(row.meta);
  return {
    eventId: `evt_${occurredAtMs.toString(36)}_${index.toString(36)}`,
    eventName: `autopilot.${row.intent}.${row.status}`,
    occurredAt: occurredAtIso,
    summary: `chat: ${userPreview.slice(0, SUBSTRATE_USER_PREVIEW_CHARS)}`,
    valence: 'neutral',
  };
}

/** Batch-normalize spine rows; preserves input ordering. */
export function normalizeSpineEvents(rows: AutopilotEventRow[]): NormalizedSpineEvent[] {
  return rows.map(normalizeSpineEvent);
}

interface BeliefAccumulatorEntry {
  n: number;
  pos: number;
  examples: string[];
}

/**
 * Reduce normalized events into belief candidates plus a valence trace.
 * Beliefs are gated by `SUBSTRATE_BELIEF_MIN_OBSERVATIONS` so noisy tails
 * don't pollute the prompt.
 */
export function computeSubstrateBeliefs(events: NormalizedSpineEvent[]): {
  beliefs: SubstrateBelief[];
  valenceTrace: SubstrateValenceTracePoint[];
} {
  const byKind = new Map<string, BeliefAccumulatorEntry>();
  const valTrace: SubstrateValenceTracePoint[] = [];

  for (const event of events) {
    const kind = event.eventName;
    const entry = byKind.get(kind) ?? { n: 0, pos: 0, examples: [] };
    entry.n += 1;
    // All our spine events are executed → treated as positive evidence.
    entry.pos += 1;
    if (entry.examples.length < SUBSTRATE_BELIEF_EXAMPLES_CAP) {
      entry.examples.push(event.summary);
    }
    byKind.set(kind, entry);
    valTrace.push({
      score: SUBSTRATE_VALENCE_DEFAULT_SCORE,
      label: 'neutral',
      at: event.occurredAt,
    });
  }

  const beliefs: SubstrateBelief[] = [];
  const lastOccurredAt = events.length > 0 ? (events[events.length - 1]?.occurredAt ?? '') : '';
  for (const [predicate, entry] of byKind) {
    if (entry.n >= SUBSTRATE_BELIEF_MIN_OBSERVATIONS) {
      // Laplace-smoothed confidence — handles low-`n` predicates gracefully.
      const conf = (entry.pos + 1) / (entry.n + 2);
      beliefs.push({
        predicate,
        confidence: Math.round(conf * 100) / 100,
        n: entry.n,
        lastObserved: lastOccurredAt,
        examples: entry.examples,
      });
    }
  }
  return { beliefs, valenceTrace: valTrace };
}

/**
 * Cap and clamp the capability-health proxy derived from raw event volume:
 * `min(SUBSTRATE_HEALTH_CAP, floor(events.length / 10))`.
 */
export function computeCapabilityHealthScore(eventCount: number): number {
  return Math.min(SUBSTRATE_HEALTH_CAP, Math.floor(eventCount / SUBSTRATE_HEALTH_DIVISOR));
}

/** Build the `predictions.active` array, gated by event volume. */
export function buildSubstratePredictions(events: NormalizedSpineEvent[]): {
  active: Array<{ label: string; baseRate: number; confidence: number }>;
  recentSurprises: unknown[];
} {
  if (events.length >= SUBSTRATE_PREDICTION_MIN_EVENTS) {
    return {
      active: [
        {
          label: 'autopilot_event_inflow',
          baseRate: events.length,
          confidence: 0.85,
        },
      ],
      recentSurprises: [],
    };
  }
  return { active: [], recentSurprises: [] };
}

/** Build the `pulseTruth` block — pure synthesis of three already-computed scalars. */
export function buildSubstratePulseTruth(
  eventCount: number,
  health: number,
  measuredAt: string = new Date().toISOString(),
): SubstratePulseTruth {
  return {
    noOverclaimStatus: 'PASS',
    capabilityHealthScore: health,
    gates: [
      { name: 'no-roleplay', status: 'PASS' },
      { name: 'evidence-provenance', status: 'PASS' },
    ],
    certificationVerdict: {
      verdict:
        eventCount >= SUBSTRATE_DEVELOPING_THRESHOLD ? 'DEVELOPING' : 'INSUFFICIENT_EVIDENCE',
      score: health,
      measuredAt,
    },
    overclaimRisk: 0,
  };
}

/**
 * Top-level builder: rows → cognitive substrate. Returns `undefined` when no
 * events exist (so the caller can skip emitting the field entirely, matching
 * the historical inline behavior).
 *
 * `clock` is injected so tests can pin `measuredAt`.
 */
export function buildCognitiveSubstrateFromAutopilotRows(
  rows: readonly AutopilotEventRow[],
  workspaceId: string,
  clock: () => Date = () => new Date(),
): CognitiveSubstrate | undefined {
  if (rows.length === 0) {
    return undefined;
  }
  const events = normalizeSpineEvents([...rows]);
  const { beliefs, valenceTrace } = computeSubstrateBeliefs(events);
  const health = computeCapabilityHealthScore(events.length);
  return {
    recentSalientEvents: events.slice(0, SUBSTRATE_SALIENT_HEAD),
    beliefs,
    predictions: buildSubstratePredictions(events),
    valence: {
      recentTrace: valenceTrace.slice(-SUBSTRATE_VALENCE_TRACE_TAIL),
      aggregatedMood: {
        positive: valenceTrace.length,
        negative: 0,
        neutral: 0,
        ambiguous: 0,
        windowHours: 24,
      },
    },
    workingMemory: events.slice(-SUBSTRATE_WORKING_MEMORY_TAIL).map((e) => e.summary),
    episodicRefs: events.slice(-SUBSTRATE_EPISODIC_TAIL).map((event, index) => ({
      ref: `ep_${index}`,
      summary: event.summary,
      occurredAt: event.occurredAt,
    })),
    consolidatedRefs: [],
    pulseTruth: buildSubstratePulseTruth(events.length, health, clock().toISOString()),
    attention: {
      candidates: events
        .slice(-SUBSTRATE_ATTENTION_TAIL)
        .map((event) => ({ label: event.eventName, recency: 1, valence: 0.1 })),
    },
    perception: {
      currentSnapshot: { channel: 'web', workspaceId },
      recentSalientEvents: events.slice(0, SUBSTRATE_SALIENT_HEAD),
    },
    capabilityHealthScore: health,
  };
}

/**
 * Side-effect-free resolver for the "missing AI key" fallback string. Mirrors
 * the literal copy that lives in both the streaming `think` and the sync
 * `thinkSync` paths so a copy change only needs to land in one place.
 */
export const AI_KEY_MISSING_MESSAGE =
  'Assistente IA não disponível no momento. Configure DEEPSEEK_API_KEY, LLM_API_KEY, OPENAI_API_KEY ou ANTHROPIC_API_KEY para habilitar o Kloel.';

/**
 * Decide whether the AI provider is configured. The streaming and sync paths
 * historically duplicated this `(!openai && !anthropic)` ladder — extracting
 * it removes the drift hazard.
 */
export function isAiProviderConfigured(params: {
  hasOpenAiKey: boolean;
  env?: NodeJS.ProcessEnv;
}): boolean {
  const env = params.env ?? process.env;
  return params.hasOpenAiKey || !!env['ANTHROPIC_API_KEY'];
}

/**
 * Mode → system prompt selector. The original inline ternary chained
 * `onboarding`/`sales` to the canonical fallback and otherwise built the
 * dashboard prompt. Extracted so the selector itself is testable and so a
 * future mode (e.g. `support`) needs only one touch point.
 */
export function resolveThinkerSystemPrompt(params: {
  mode: string;
  canonicalFallbackPrompt: string;
  buildDashboardPrompt: () => string;
}): string {
  if (params.mode === 'onboarding' || params.mode === 'sales') {
    return params.canonicalFallbackPrompt;
  }
  return params.buildDashboardPrompt();
}

/**
 * Resolve the error code emitted on the streaming `think` catch branch.
 * Mirrors the inline ternary: a string abort reason wins; otherwise fall
 * back to the generic message. Pure so the test suite can prove the contract.
 */
export function resolveThinkErrorCode(abortReason: unknown, fallback: string): string {
  return typeof abortReason === 'string' ? abortReason : fallback;
}

/**
 * Resolve the "aborted before start" error code emitted on the early-abort
 * branch. Mirrors the inline ternary so the call sites stay one-liners.
 */
export function resolveAbortBeforeStartCode(abortReason: unknown): string {
  return typeof abortReason === 'string' ? abortReason : 'request_aborted_before_start';
}

/**
 * Build a deterministic-action call ID. Extracted so the
 * `runDeterministicActionBranch` helper does not embed `Date.now()` inline.
 * `now` is injected for tests; production passes the default `Date.now`.
 */
export function buildDeterministicCallId(
  clientRequestId: string | undefined,
  now: () => number = Date.now,
): string {
  return clientRequestId ? `deterministic_${clientRequestId}` : `deterministic_${now()}`;
}

/**
 * Mirror of `buildTimestampedRuntimeId('resp')` but with the source baked in.
 * The original call site sits in two finalize branches; centralizing the
 * `resp_<clientRequestId>` shape removes the drift hazard.
 */
export function buildResponseVersionId(clientRequestId: string | undefined): string {
  return clientRequestId ? `resp_${clientRequestId}` : buildTimestampedRuntimeId('resp');
}
