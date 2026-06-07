import { Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { StructuredLogger } from '../../../logging/structured-logger';
import { PrismaService } from '../../../prisma/prisma.service';
import { SpineEmitterService } from '../../spine/spine-emitter.service';
import type { SpineEventEnvelope } from '../../spine/spine-event.types';
import { defaultValenceFor, isTerminalEvent } from '../mind.types';

/**
 * Wave4 L10 — Y-8 frontier capability #2: continuous / persistent learning.
 *
 * Per `docs/architecture/KLOEL_FRONTIER_COGNITION.md` §CAPABILITY 2, the Mind
 * should consolidate per-workspace LONG-TERM memory that self-updates from
 * outcomes, instead of every conversation starting from a blank slate. Today
 * `CaseConsolidationService.consolidate()` runs a periodic cases→concepts
 * sweep, but nothing turns terminal OUTCOMES into durable, reinforceable facts
 * the reply path can recall, and there is no online (event-driven) update.
 *
 * This service closes that gap as a SPINE CONSUMER (mirroring the
 * `CommerceOutcomeLearnerService` pattern). On every terminal cognitive /
 * commerce outcome with a resolvable valence it consolidates a durable fact
 * into the existing `RAC_MindGraphNode` table — Hebbian style:
 *   - first occurrence  → create a fact node with a small base weight;
 *   - repeated occurrence → REINFORCE (weight grows toward a ceiling,
 *     time-decayed first so stale facts fade — "neurons that fire together,
 *     wire together; cells that fire out of sync, lose their link");
 *   - the valence (positive/negative) is carried in `metadata` so recall can
 *     surface "what tends to work" vs "what tends to fail" per workspace.
 *
 * `recallRelevant(workspaceId, context)` is the read path the reply engine can
 * query before answering: it returns the strongest (most reinforced, most
 * recent) durable facts for the workspace, time-decayed at read time so the
 * ranking reflects current salience without a write.
 *
 * Reuses existing tables only — `RAC_MindGraphNode`
 * (`@@unique([workspaceId, kind, label])`, has a `weight` Float and a
 * `metadata` Json). No new schema, no `db push`.
 *
 * Guarantees (match the Mind learner contract):
 *   - Append-only semantics: a fact node is created once and thereafter only
 *     has its `weight` reinforced/decayed and `metadata` counters bumped — no
 *     historical fact is deleted by the online path. (Decay never drops a node;
 *     it only shrinks weight toward a floor.)
 *   - Idempotent: a bounded recently-seen `eventId` window prevents a spine
 *     replay from double-reinforcing the same outcome.
 *   - Fire-and-forget: the subscribe handler is sync; all async work is
 *     detached and guarded so a learning failure NEVER breaks the spine loop
 *     or the business path.
 */
@Injectable()
export class GraphFactMemoryService {
  private readonly logger = StructuredLogger.from(GraphFactMemoryService.name);

  /** Node kind under which durable outcome facts are stored in the graph. */
  public static readonly FACT_KIND = 'ltm:outcome-fact';

  /** Half-life of a fact's reinforcement, in ms (≈ 14 days). */
  private static readonly HALF_LIFE_MS = 14 * 24 * 3600 * 1000;

  /** Weight a freshly-observed fact starts at. */
  private static readonly BASE_WEIGHT = 1;

  /** Reinforcement added (pre-decay) each time a fact recurs. */
  private static readonly REINFORCE_STEP = 1;

  /** Hard ceiling so a single hot fact cannot dominate recall forever. */
  private static readonly MAX_WEIGHT = 25;

  /** Floor so a decayed fact never disappears via the online path. */
  private static readonly MIN_WEIGHT = 0.05;

  /** Bounded dedup window so a spine replay never double-reinforces. */
  private static readonly DEDUP_CAPACITY = 5000;
  private readonly seenEventIds = new Set<string>();

  public constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly spine?: SpineEmitterService,
  ) {
    this.spine?.subscribe((event) => {
      // Sync handler: never await, never throw into the emitter loop.
      void this.handle(event).catch(() => {
        // Defensive: handle() already swallows; this guards the promise itself.
      });
    });
    this.logger.debug?.('GraphFactMemoryService initialized');
  }

  /**
   * Process a single spine envelope. Public for direct unit testing (the spec
   * drives this without standing up the full emitter).
   */
  public async handle(event: SpineEventEnvelope): Promise<void> {
    const fact = this.resolveFact(event);
    if (fact === undefined) {
      return;
    }
    if (this.isDuplicate(event.eventId)) {
      return;
    }
    await this.consolidateFact(fact.workspaceId, fact.label, fact.valence, event.occurredAt);
  }

  /**
   * Read path for the reply engine — recall the strongest durable facts for a
   * workspace, time-decayed at read time so the ranking reflects current
   * salience. `context` may narrow recall to a positive/negative slant; when
   * omitted, the top facts across both polarities are returned.
   *
   * Scope is strictly isolated by workspaceId. Read-only: never mutates state.
   */
  public async recallRelevant(
    workspaceId: string,
    context?: { readonly valence?: 'positive' | 'negative'; readonly limit?: number },
  ): Promise<
    Array<{
      readonly fact: string;
      readonly valence: 'positive' | 'negative';
      readonly strength: number;
      readonly occurrences: number;
    }>
  > {
    const limit = Math.max(1, Math.min(context?.limit ?? 10, 50));
    try {
      const rows = await this.prisma.mindGraphNode.findMany({
        where: { workspaceId, kind: GraphFactMemoryService.FACT_KIND },
        orderBy: { weight: 'desc' },
        take: 200,
      });

      const now = Date.now();
      const recalled = rows
        .map((row) => {
          const meta = (row.metadata as Record<string, unknown> | null) ?? {};
          const valence: 'positive' | 'negative' =
            meta['valence'] === 'negative' ? 'negative' : 'positive';
          const occurrences = typeof meta['occurrences'] === 'number' ? meta['occurrences'] : 1;
          const lastAt = typeof meta['lastAt'] === 'string' ? Date.parse(meta['lastAt']) : now;
          const strength = this.decayWeight(row.weight, lastAt, now);
          return {
            fact: row.label,
            valence: valence,
            strength,
            occurrences,
          };
        })
        .filter((r) => (context?.valence ? r.valence === context.valence : true))
        .sort((a, b) => b.strength - a.strength)
        .slice(0, limit);

      return recalled;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn({
        operation: 'mind.ltm.recall_relevant',
        status: 'error',
        workspaceId,
        errorCode: message,
      });
      return [];
    }
  }

  // ─── private helpers ───────────────────────────────────────────────

  /**
   * Map a terminal cognitive / commerce event to a durable fact. A fact is a
   * stable, human-readable label keyed by the event name (so repeats of the
   * same outcome collide on the graph's unique key and reinforce). Non-terminal
   * events and events without a resolvable positive/negative valence are
   * skipped.
   */
  private resolveFact(
    event: SpineEventEnvelope,
  ): { workspaceId: string; label: string; valence: 'positive' | 'negative' } | undefined {
    if (event.workspaceId === undefined || event.workspaceId === '') {
      return undefined;
    }
    if (!isTerminalEvent(event.eventName)) {
      return undefined;
    }
    const valence = event.valence ?? defaultValenceFor(event.eventName);
    if (valence !== 'positive' && valence !== 'negative') {
      // neutral / unknown → not a durable learning signal.
      return undefined;
    }
    return { workspaceId: event.workspaceId, label: event.eventName, valence };
  }

  private isDuplicate(eventId: string): boolean {
    if (this.seenEventIds.has(eventId)) {
      return true;
    }
    this.seenEventIds.add(eventId);
    if (this.seenEventIds.size > GraphFactMemoryService.DEDUP_CAPACITY) {
      const oldest = this.seenEventIds.values().next().value;
      if (oldest !== undefined) {
        this.seenEventIds.delete(oldest);
      }
    }
    return false;
  }

  /**
   * Hebbian consolidation into `MindGraphNode`. Decays the existing weight to
   * the present instant, adds a reinforcement step (clamped to a ceiling), and
   * bumps the occurrence counter — all in a single upsert keyed by the table's
   * `@@unique([workspaceId, kind, label])`.
   */
  private async consolidateFact(
    workspaceId: string,
    label: string,
    valence: 'positive' | 'negative',
    occurredAtIso: string,
  ): Promise<void> {
    try {
      const now = Date.now();
      const existing = await this.prisma.mindGraphNode.findUnique({
        where: {
          workspaceId_kind_label: {
            workspaceId,
            kind: GraphFactMemoryService.FACT_KIND,
            label,
          },
        },
      });

      if (existing === null) {
        await this.prisma.mindGraphNode.create({
          data: {
            id: randomUUID(),
            workspaceId,
            kind: GraphFactMemoryService.FACT_KIND,
            label,
            weight: GraphFactMemoryService.BASE_WEIGHT,
            metadata: {
              valence,
              occurrences: 1,
              firstAt: occurredAtIso,
              lastAt: occurredAtIso,
            },
          },
        });
        return;
      }

      const meta = (existing.metadata as Record<string, unknown> | null) ?? {};
      const lastAt = typeof meta['lastAt'] === 'string' ? Date.parse(meta['lastAt']) : now;
      const occurrences = typeof meta['occurrences'] === 'number' ? meta['occurrences'] : 1;

      const decayed = this.decayWeight(existing.weight, lastAt, now);
      const reinforced = Math.min(
        GraphFactMemoryService.MAX_WEIGHT,
        decayed + GraphFactMemoryService.REINFORCE_STEP,
      );

      await this.prisma.mindGraphNode.updateMany({
        where: { id: existing.id, workspaceId },
        data: {
          weight: reinforced,
          metadata: {
            ...meta,
            valence,
            occurrences: occurrences + 1,
            lastAt: occurredAtIso,
          },
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn({
        operation: 'mind.ltm.consolidate_fact',
        status: 'error',
        workspaceId,
        errorCode: message,
      });
    }
  }

  /**
   * Exponential time decay of a reinforcement weight, floored so a fact never
   * drops out via the online path. "Cells that fire out of sync lose their
   * link" — but the link is weakened, never severed.
   */
  private decayWeight(weight: number, lastAtMs: number, nowMs: number): number {
    const elapsed = Math.max(0, nowMs - lastAtMs);
    const factor = Math.pow(0.5, elapsed / GraphFactMemoryService.HALF_LIFE_MS);
    return Math.max(GraphFactMemoryService.MIN_WEIGHT, weight * factor);
  }
}
