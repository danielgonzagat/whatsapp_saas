/**
 * Cognitive consolidation pass for the MIND long-tick.
 *
 * Three production modules — `recovery` (self-error detection), `role`
 * (commercial role detection), and `offer` (offer-evolution insights) — ship
 * real, unit-tested detector logic but were registered in `app.module.ts` with
 * ZERO downstream consumers: their code never executed against production
 * events. Their entrypoints are all PURE functions over the exact shape the
 * mind long-tick already holds (`{ events: SpineEventRef[], workspaceId, nowMs }`),
 * so this helper fires them on the long cadence and emits ONE compact, throttled
 * summary spine event (`cognition.consolidation_scan`) so the findings become
 * observable and available to any spine observer.
 *
 * Design constraints (mirrors the existing `cognitiveHealth?.scanAndEscalate`
 * pattern in the scheduler):
 *   - PURE inputs, NO DI — the detectors are standalone functions, so wiring
 *     them needs no module-graph edit; the only collaborator is the
 *     `SpineEmitterService` the scheduler already injects (the sink).
 *   - FULLY fire-and-forget — every detector call and the emit are wrapped so a
 *     failure can NEVER disturb the mind tick.
 *   - THROTTLED per workspace (default 30 min) so the deterministic detectors do
 *     not re-emit the same summary every tick or flood the spine ring.
 *   - Emits only when there is a MATERIAL finding; a quiet workspace still marks
 *     the throttle so the detectors are not re-run every tick for nothing.
 */
import { Logger } from '@nestjs/common';
import type { SpineEventRef } from './mind.types';
import type { SpineEmitterService } from '../spine/spine-emitter.service';
import { detectErrors } from '../recovery/self-error-detector';
import { detectRoles, primaryRoleFromDetections } from '../role/role.detector';
import { detectBonusDesirability } from '../offer/detectors/bonus-desirability.detector';
import { detectPagePromiseMismatch } from '../offer/detectors/page-promise-mismatch.detector';
import { detectPositioningMismatch } from '../offer/detectors/positioning-mismatch.detector';
import { detectPricingPsychologySignal } from '../offer/detectors/pricing-psychology-signal.detector';
import { detectProductVersionFit } from '../offer/detectors/product-version-fit.detector';
import { detectPromiseStrength } from '../offer/detectors/promise-strength.detector';
import type { OfferInsight } from '../offer/offer.types';
import { PositioningUniquenessDetector } from '../defens/positioning-uniqueness.detector';
import { SocialProofHarvester } from '../defens/social-proof.harvester';
import { CommemExporterService } from '../commem/commem-exporter.service';
import { CommemLedgerService } from '../commem/ledger.service';
import { MemoryProjector } from '../commem/memory.projector';
import { ExporterService } from '../commem/exporter.service';
import { AttributionGuard } from '../commem/attribution.guard';
import { MarketEntryDecisionService } from '../hypproof/market-entry-decision.service';
import { HypothesisFormulatorService } from '../hypproof/hypothesis-formulator';
import { MicroExperimentDesignerService } from '../hypproof/micro-experiment.designer';
import { CashPositionTracker } from '../cash/cash-position.tracker';
import type { CashEntry } from '../cash/types';
import { GoalFieldService } from '../goal-field/goal-field.service';

const PROCESSOR = 'mind-cognitive-consolidation';
const PROCESSOR_VERSION = '1.0.0';
const SCHEMA_VERSION = '1.0.0';
/** Per-workspace minimum gap between consolidation emits. */
const DEFAULT_THROTTLE_MS = 30 * 60 * 1000;
/** Recovery self-error detection window. */
const ERROR_WINDOW_DAYS = 7;

export interface CognitiveConsolidationDeps {
  readonly events: readonly SpineEventRef[];
  readonly workspaceId: string;
  readonly nowMs: number;
  /** The sink — only `.emit` is used. */
  readonly spine: Pick<SpineEmitterService, 'emit'>;
  /** Per-workspace last-emit clock owned by the caller (singleton scheduler). */
  readonly throttle: Map<string, number>;
  readonly throttleMs?: number;
  readonly logger?: Logger;
}

/**
 * Feature flag for the cognitive consolidation pass. DEFAULT ON — the pass only
 * runs dormant detector logic and emits a single throttled summary event, all
 * fire-and-forget, so it is safe on by default and aligns with bringing the
 * previously-dead defensive/commercial modules to life. Hard-off via
 * `KLOEL_COGNITIVE_CONSOLIDATION_ENABLED=false`.
 */
export function isCognitiveConsolidationEnabled(): boolean {
  return (process.env.KLOEL_COGNITIVE_CONSOLIDATION_ENABLED ?? 'true').toLowerCase() !== 'false';
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Run the dormant tick-shaped detectors over this long-tick's events and emit a
 * compact, throttled summary. Returns the emitted summary (or `null` when
 * throttled / nothing material) to make the behavior unit-testable.
 */
export async function runCognitiveConsolidation(
  deps: CognitiveConsolidationDeps,
): Promise<Record<string, unknown> | null> {
  const { events, workspaceId, nowMs, spine, throttle, logger } = deps;
  const throttleMs = deps.throttleMs ?? DEFAULT_THROTTLE_MS;

  if (events.length === 0) {
    return null;
  }
  const last = throttle.get(workspaceId);
  if (last !== undefined && nowMs - last < throttleMs) {
    return null;
  }

  let errorCount = 0;
  let highSeverityErrors = 0;
  let primaryRole: string | null = null;
  let roleConfidence = 0;
  let offerInsightCount = 0;
  let topOffer: OfferInsight | undefined;
  let positioningSignals = 0;
  let socialProofSignals = 0;
  let knowledgeLedgerEntries = 0;
  let knowledgeProjections = 0;
  let knowledgeAuditable = false;
  let marketEntryDecisions = 0;
  let cashEntriesObserved = 0;
  let cashBalanceCents: string | null = null;
  let cashTrend30d = 0;
  let goalTensions = 0;
  let goalCandidates = 0;
  let topGoalSummary: string | null = null;

  try {
    const errors = detectErrors({ events, workspaceId, nowMs, windowDays: ERROR_WINDOW_DAYS });
    errorCount = errors.length;
    highSeverityErrors = errors.filter((e) => e.severity === 'high').length;
  } catch (err: unknown) {
    logger?.warn(`cognitive consolidation: recovery detector failed: ${errMsg(err)}`);
  }

  try {
    const detections = detectRoles({ events, workspaceId, nowMs });
    const primary = primaryRoleFromDetections(detections);
    if (primary !== undefined) {
      primaryRole = primary;
      roleConfidence = detections.find((d) => d.role === primary)?.confidence ?? 0;
    }
  } catch (err: unknown) {
    logger?.warn(`cognitive consolidation: role detector failed: ${errMsg(err)}`);
  }

  try {
    const offerInput = { events, workspaceId, nowMs };
    const insights: OfferInsight[] = [
      ...detectBonusDesirability(offerInput).insights,
      ...detectPagePromiseMismatch(offerInput).insights,
      ...detectPositioningMismatch(offerInput).insights,
      ...detectPricingPsychologySignal(offerInput).insights,
      ...detectProductVersionFit(offerInput).insights,
      ...detectPromiseStrength(offerInput).insights,
    ];
    offerInsightCount = insights.length;
    topOffer = [...insights].sort(
      (a, b) => b.impactMultiplicative * b.confidence - a.impactMultiplicative * a.confidence,
    )[0];
  } catch (err: unknown) {
    logger?.warn(`cognitive consolidation: offer detectors failed: ${errMsg(err)}`);
  }

  try {
    // Defensibility detectors are stateless @Injectable classes with no
    // constructor deps, so they instantiate without the Nest container.
    const evidence = { events, workspaceId, nowMs };
    positioningSignals = new PositioningUniquenessDetector().detect(evidence).length;
    socialProofSignals = new SocialProofHarvester().harvest(evidence).length;
  } catch (err: unknown) {
    logger?.warn(`cognitive consolidation: defens detectors failed: ${errMsg(err)}`);
  }

  try {
    // ComMem services are pure logic with only intra-module deps, so the
    // exporter composes from freshly-newed sub-services — no Nest container.
    const commem = new CommemExporterService(
      new CommemLedgerService(),
      new MemoryProjector(),
      new ExporterService(),
      new AttributionGuard(),
    );
    const knowledge = commem.exportAggregated(workspaceId, events);
    knowledgeLedgerEntries = knowledge.ledger.length;
    knowledgeProjections = knowledge.projections.length;
    knowledgeAuditable = knowledge.attestation.isAuditable;
  } catch (err: unknown) {
    logger?.warn(`cognitive consolidation: commem exporter failed: ${errMsg(err)}`);
  }

  try {
    // Derive observed cash flow from this window's payment events. The payment
    // spine event payload carries amountCents as a string (ledger emitter); a
    // refund is an outflow so it enters as a negative entry. CashPositionTracker
    // is a stateless @Injectable, so it news without the container. This is a
    // window-scoped observed snapshot (not the full ledger), labelled as such.
    const cashEntries: CashEntry[] = [];
    for (const e of events) {
      if (
        e.eventName !== 'commerce.payment.approved' &&
        e.eventName !== 'commerce.payment.refunded'
      ) {
        continue;
      }
      const raw = e.payload?.['amountCents'];
      if (typeof raw !== 'string' && typeof raw !== 'number' && typeof raw !== 'bigint') {
        continue;
      }
      let cents: bigint;
      try {
        cents = BigInt(raw);
      } catch {
        logger?.warn(`cognitive consolidation: skipping non-numeric amountCents=${String(raw)}`);
        continue;
      }
      if (cents <= 0n) {
        continue;
      }
      cashEntries.push({
        workspaceId,
        amountCents: e.eventName === 'commerce.payment.refunded' ? -cents : cents,
        entryDate: e.occurredAt,
        category: 'actual',
        confidence: 1,
        source: `spine:${e.eventName}`,
      });
    }
    cashEntriesObserved = cashEntries.length;
    if (cashEntries.length > 0) {
      const position = new CashPositionTracker().track(cashEntries, workspaceId, nowMs);
      cashBalanceCents = position.currentBalanceCents.toString();
      cashTrend30d = position.trend30d;
    }
  } catch (err: unknown) {
    logger?.warn(`cognitive consolidation: cash tracker failed: ${errMsg(err)}`);
  }

  try {
    // Goal-field's runCycle is tick-shaped and the service news cleanly (its
    // detector set and deps are all @Optional, so the default detector bank is
    // used). Shadow mode (default) only DETECTS goal candidates from event
    // tensions — it never promotes — so it is safe to run on every tick.
    const goalResult = new GoalFieldService().runCycle({ events, nowMs, mode: 'shadow' });
    goalTensions = goalResult.tensions.length;
    goalCandidates = goalResult.candidates.length;
    const topGoal = [...goalResult.candidates].sort((a, b) => b.score - a.score)[0];
    topGoalSummary = topGoal !== undefined ? topGoal.summary : null;
  } catch (err: unknown) {
    logger?.warn(`cognitive consolidation: goal-field cycle failed: ${errMsg(err)}`);
  }

  try {
    // SpineEventRef is structurally a SpineSignal (carries every required
    // field), so it feeds decideFromSignals directly. The formulator and
    // designer are dep-free @Injectable classes, so the facade news cleanly.
    const decider = new MarketEntryDecisionService(
      new HypothesisFormulatorService(),
      new MicroExperimentDesignerService(),
    );
    marketEntryDecisions = decider.decideFromSignals(events).length;
  } catch (err: unknown) {
    logger?.warn(`cognitive consolidation: hypproof decider failed: ${errMsg(err)}`);
  }

  // Mark the throttle even on a quiet workspace so deterministic detectors are
  // not re-run every tick when there is nothing to report.
  throttle.set(workspaceId, nowMs);

  // Materiality is gated on the EVENT-DRIVEN detectors (errors / role / offer):
  // the defensibility detectors emit a near-constant baseline regardless of the
  // event window, so they ride along as context in the payload but never on
  // their own force a periodic emit (which would defeat the throttle's intent).
  if (errorCount === 0 && primaryRole === null && offerInsightCount === 0) {
    return null;
  }

  const summary: Record<string, unknown> = {
    errorCount,
    highSeverityErrors,
    primaryRole,
    roleConfidence,
    offerInsightCount,
    topOfferInsight:
      topOffer !== undefined
        ? {
            kind: topOffer.kind,
            description: topOffer.description,
            impactMultiplicative: topOffer.impactMultiplicative,
            confidence: topOffer.confidence,
          }
        : null,
    positioningSignals,
    socialProofSignals,
    knowledgeLedgerEntries,
    knowledgeProjections,
    knowledgeAuditable,
    marketEntryDecisions,
    cashEntriesObserved,
    cashBalanceCents,
    cashTrend30d,
    goalTensions,
    goalCandidates,
    topGoalSummary,
    eventsScanned: events.length,
  };

  try {
    await spine.emit({
      eventName: 'cognition.consolidation_scan',
      workspaceId,
      truthMode: 'inferred',
      provenance: {
        source: 'production',
        processor: PROCESSOR,
        processorVersion: PROCESSOR_VERSION,
        schemaVersion: SCHEMA_VERSION,
      },
      payload: summary,
      occurredAt: new Date(nowMs).toISOString(),
    });
  } catch (err: unknown) {
    logger?.warn(`cognitive consolidation: spine emit failed: ${errMsg(err)}`);
  }

  return summary;
}
