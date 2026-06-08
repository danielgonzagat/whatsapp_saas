import { Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { StructuredLogger } from '../../../logging/structured-logger';
import { PrismaService } from '../../../prisma/prisma.service';
import { SpineEmitterService } from '../../spine/spine-emitter.service';
import type { SpineEventEnvelope } from '../../spine/spine-event.types';
import { DecisionOutcomeService } from '../../decision-outcome.service';
import { MindBeliefService } from '../inference/mind-belief.service';
import { defaultValenceFor, isTerminalEvent } from '../mind.types';

/**
 * Wave3 — Commerce → Cognition loop closure.
 *
 * Real business outcomes (a sale approved, a lead converted/lost, a refund,
 * a chargeback) are emitted on the spine and consumed today ONLY by
 * detectors/scorers for feature extraction — they never updated the Mind's
 * beliefs or the contextual bandit. The estado→ação→consequência→APRENDIZADO
 * loop was therefore CLOSED for chat replies (via DecisionOutcomeService
 * .closeOutcome → bandit) but OPEN for commerce outcomes.
 *
 * This consumer closes that gap. On every terminal commerce event with a
 * resolvable binary valence it:
 *   1. Feeds the win/loss into MindBeliefService.observeBinary — a Beta
 *      belief keyed by (subject = COMMERCE_BELIEF_SUBJECT, predicate =
 *      eventName) so the Mind accumulates per-workspace evidence about which
 *      commerce outcomes actually happen.
 *   2. If the envelope carries a correlationId (the outcomeKey used by the
 *      decision path), it also calls DecisionOutcomeService.closeOutcome so a
 *      matching OPEN decision — if one exists — is closed and propagated into
 *      the bandit/global-prior via the canonical chat-loop entrypoint. When no
 *      open decision matches, closeOutcome's updateMany is a natural no-op.
 *
 * Guarantees:
 *   - Append-only: observeBinary increments Beta α/β; closeOutcome only fills
 *     rows whose outcomeAt is still null. Neither mutates historical rows.
 *   - Idempotent (DURABLE): a two-tier dedup prevents a spine replay or a
 *     cross-instance re-delivery from double-incrementing the Beta belief
 *     (observeBinary itself is NOT idempotent). L1 = a bounded in-memory
 *     recently-seen set (fast path). L2 = a durable per-event marker row in
 *     RAC_MindOutboxEvent keyed by the (workspaceId, idempotencyKey) unique
 *     constraint — survives restart and is shared across instances, so the
 *     at-most-once guarantee holds even if the in-memory set evicts or the
 *     process restarts. The marker doubles as a `cognition.commerce_outcome.learned`
 *     audit row. When PrismaService is absent (unit tests) it degrades to L1
 *     only. closeOutcome is already idempotent on outcomeAt.
 *   - Fire-and-forget: a learning failure NEVER breaks the commerce path —
 *     the subscribe handler is sync, all async work is detached and guarded.
 *   - Canonical entrypoints only: reuses MindBeliefService.observeBinary and
 *     DecisionOutcomeService.closeOutcome — no parallel learning path.
 */
@Injectable()
export class CommerceOutcomeLearnerService {
  private readonly logger = StructuredLogger.from(CommerceOutcomeLearnerService.name);

  /** Stable belief subject under which commerce outcome evidence accrues. */
  public static readonly COMMERCE_BELIEF_SUBJECT = 'commerce:outcome';

  /** Bounded dedup window so a spine replay never double-counts a Beta update. */
  private static readonly DEDUP_CAPACITY = 5000;
  private readonly seenEventIds = new Set<string>();

  public constructor(
    private readonly belief: MindBeliefService,
    @Optional() private readonly decisionOutcome?: DecisionOutcomeService,
    @Optional() private readonly spine?: SpineEmitterService,
    @Optional() private readonly prisma?: PrismaService,
  ) {
    this.spine?.subscribe((event) => {
      // Sync handler: never await, never throw into the emitter loop.
      void this.handle(event).catch(() => {
        // Defensive: handle() already swallows; this guards the promise itself.
      });
    });
  }

  /**
   * Process a single spine envelope. Public for direct unit testing (the spec
   * drives this without standing up the full emitter).
   */
  public async handle(event: SpineEventEnvelope): Promise<void> {
    const outcome = this.resolveOutcome(event);
    if (outcome === undefined) {
      return;
    }
    if (event.workspaceId === undefined || event.workspaceId === '') {
      return;
    }
    if (await this.isDuplicate(event.workspaceId, event.eventId, event.eventName)) {
      return;
    }

    await this.observe(event.workspaceId, event.eventName, outcome, event.eventId);
    await this.maybeCloseDecision(event, outcome);
  }

  // ─── private helpers ───────────────────────────────────────────────

  /**
   * Map a terminal commerce event to a binary outcome via its (possibly
   * auto-tagged) valence. positive → 1, negative → 0. neutral/unknown events
   * and non-terminal / non-commerce events are skipped (return undefined).
   */
  private resolveOutcome(event: SpineEventEnvelope): 0 | 1 | undefined {
    if (!event.eventName.startsWith('commerce.')) {
      return undefined;
    }
    if (!isTerminalEvent(event.eventName)) {
      return undefined;
    }
    const valence = event.valence ?? defaultValenceFor(event.eventName);
    if (valence === 'positive') {
      return 1;
    }
    if (valence === 'negative') {
      return 0;
    }
    // neutral / undefined → not a learning signal.
    return undefined;
  }

  /**
   * Two-tier at-most-once guard. Returns true when this eventId has already been
   * learned from (skip), false when it is the first sighting (proceed).
   *
   * L1 (in-memory, fast): a bounded recently-seen set. L2 (durable): an
   * idempotent marker row in RAC_MindOutboxEvent — its (workspaceId,
   * idempotencyKey) unique constraint makes the FIRST writer win across restarts
   * and instances; a unique-violation on create means another path already
   * learned from this event. Marker-first (before observe) gives at-most-once,
   * which is the correct bias for belief learning (never double-count). When
   * Prisma is absent (unit tests) this degrades to L1-only — the prior behavior.
   */
  private async isDuplicate(
    workspaceId: string,
    eventId: string,
    eventName: string,
  ): Promise<boolean> {
    if (this.seenEventIds.has(eventId)) {
      return true;
    }

    if (this.prisma) {
      try {
        await this.prisma.mindOutboxEvent.create({
          data: {
            id: randomUUID(),
            workspaceId,
            eventType: 'cognition.commerce_outcome.learned',
            subject: `commerce:learn:${eventId}`,
            payload: { eventName } satisfies Prisma.InputJsonObject,
            idempotencyKey: `commerce-learn:${eventId}`,
            occurredAt: new Date(),
          },
        });
      } catch (error: unknown) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          // Durable marker already exists → another path/instance/run learned
          // from this event. Skip (at-most-once).
          this.remember(eventId);
          return true;
        }
        // Any other DB error: do NOT block learning (best-effort) — fall through
        // to L1-only for this event.
      }
    }

    this.remember(eventId);
    return false;
  }

  /** Record an eventId in the bounded in-memory L1 window (insertion-ordered). */
  private remember(eventId: string): void {
    this.seenEventIds.add(eventId);
    if (this.seenEventIds.size > CommerceOutcomeLearnerService.DEDUP_CAPACITY) {
      const oldest = this.seenEventIds.values().next().value;
      if (oldest !== undefined) {
        this.seenEventIds.delete(oldest);
      }
    }
  }

  private async observe(
    workspaceId: string,
    eventName: string,
    outcome: 0 | 1,
    eventId: string,
  ): Promise<void> {
    try {
      await this.belief.observeBinary(
        workspaceId,
        CommerceOutcomeLearnerService.COMMERCE_BELIEF_SUBJECT,
        eventName,
        { eventName },
        outcome,
      );
    } catch (error: unknown) {
      this.logger.warn({
        operation: 'mind.commerce_outcome.observe_binary',
        status: 'error',
        workspaceId,
        eventName,
        eventId,
        errorCode: error instanceof Error ? error.message : 'unknown',
      });
    }
  }

  /**
   * Close a matching OPEN decision when the envelope carries the outcomeKey as
   * its correlationId. closeOutcome's updateMany no-ops when nothing matches,
   * so this is safe to call unconditionally for correlated events.
   */
  private async maybeCloseDecision(event: SpineEventEnvelope, outcome: 0 | 1): Promise<void> {
    if (!this.decisionOutcome) {
      return;
    }
    const outcomeKey = this.resolveOutcomeKey(event);
    if (outcomeKey === undefined) {
      return;
    }
    try {
      await this.decisionOutcome.closeOutcome({
        outcomeKey,
        outcomeName: event.eventName,
        wonVsBaseline: outcome === 1,
      });
    } catch (error: unknown) {
      this.logger.warn({
        operation: 'mind.commerce_outcome.close_outcome',
        status: 'error',
        workspaceId: event.workspaceId,
        eventName: event.eventName,
        outcomeKey,
        errorCode: error instanceof Error ? error.message : 'unknown',
      });
    }
  }

  /**
   * Resolve the decision outcomeKey carried by a commerce envelope. The chat
   * decision path stores the key as the envelope's top-level `correlationId`
   * (see kloel-reply-engine.decision-outcome.helpers.buildChatOutcomeKey), but
   * some commerce emitters thread it through the payload instead. We honor the
   * canonical `correlationId` first, then fall back to `payload.outcomeKey` /
   * `payload.correlationId`, so the feedback reaches the bandit regardless of
   * which surface emitted it. Returns undefined when no non-empty string key is
   * present — closeOutcome is then never called (its updateMany would no-op
   * anyway, but skipping avoids a pointless query).
   */
  private resolveOutcomeKey(event: SpineEventEnvelope): string | undefined {
    const candidates: ReadonlyArray<unknown> = [
      event.correlationId,
      event.payload?.['outcomeKey'],
      event.payload?.['correlationId'],
    ];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.length > 0) {
        return candidate;
      }
    }
    return undefined;
  }
}
