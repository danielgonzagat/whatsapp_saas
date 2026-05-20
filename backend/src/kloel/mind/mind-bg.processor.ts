import { Injectable, Logger } from '@nestjs/common';
import { ConsolidationService } from './consolidation.service';
import { HebbianService } from './hebbian.service';
import {
  MultiTimescaleCoordinator,
  Timescale,
} from './multi-timescale.coordinator';
import { ValenceAggregatorService } from './valence-aggregator.service';
import { SpineEventRef } from './mind.types';
import type { WorkingMemoryItem } from './consolidation.service';

/**
 * UTP-MIND-BG-001 — Background processor for the MIND substrate.
 *
 * Implements B8 — continuous activity without external trigger. The
 * processor is rate-limited per timescale via the coordinator. In
 * production this is wired to BullMQ; in tests it can be invoked directly.
 *
 * The processor is intentionally STATELESS w.r.t. external systems — it
 * receives the inputs (recent events, working memory) from the caller and
 * returns a structured tick result. This keeps it pure and makes the
 * BullMQ/cron wiring trivial.
 */

export interface BgTickInput {
  readonly nowMs?: number;
  readonly recentEvents: readonly SpineEventRef[];
  readonly workingMemory: readonly WorkingMemoryItem[];
}

export interface BgTickResult {
  readonly firedScales: readonly Timescale[];
  readonly hebbianAfterDecay: number;
  readonly mood?: ReturnType<ValenceAggregatorService['aggregate']>;
  readonly consolidation?: ReturnType<ConsolidationService['runCycle']>;
}

@Injectable()
export class MindBackgroundProcessor {
  private readonly logger = new Logger(MindBackgroundProcessor.name);
  private lastDecayMs: number;

  public constructor(
    private readonly coordinator: MultiTimescaleCoordinator,
    private readonly valenceAggregator: ValenceAggregatorService,
    private readonly hebbian: HebbianService,
    private readonly consolidation: ConsolidationService,
  ) {
    this.lastDecayMs = Date.now();
  }

  public tick(input: BgTickInput): BgTickResult {
    const nowMs = input.nowMs ?? Date.now();
    const due = this.coordinator.dueScales(nowMs);
    let mood: BgTickResult['mood'];
    let consolidation: BgTickResult['consolidation'];

    if (due.includes('short')) {
      this.hebbian.ingest(input.recentEvents);
      this.coordinator.markFired('short', nowMs);
    }
    if (due.includes('medium')) {
      this.hebbian.decay(new Date(nowMs), new Date(this.lastDecayMs));
      this.lastDecayMs = nowMs;
      mood = this.valenceAggregator.aggregate(input.recentEvents, 24, nowMs);
      this.coordinator.markFired('medium', nowMs);
    }
      // Auto-generate working memory items from recent events if none provided
      const effectiveWorkingMemory: WorkingMemoryItem[] = input.workingMemory.length > 0
        ? [...input.workingMemory]
        : input.recentEvents.slice(0, 10).map((e, i) => ({
            itemId: `wm_auto_${i}_${Date.now().toString(36)}`,
            kind: 'fact' as const,
            content: e.eventName,
            addedAt: new Date(nowMs).toISOString(),
            relatedEventIds: [e.eventId],
          }));
    if (due.includes('long')) {
      consolidation = this.consolidation.runCycle({
        workingMemory: effectiveWorkingMemory,
        recentEvents: input.recentEvents,
        mode: 'real',
        nowIso: new Date(nowMs).toISOString(),
      });
      this.coordinator.markFired('long', nowMs);
    }
    this.logger.debug(
      `mind bg tick — fired=[${due.join(',')}] hebbianSize=${this.hebbian.size()}`,
    );
    return {
      firedScales: due,
      hebbianAfterDecay: this.hebbian.size(),
      ...(mood !== undefined ? { mood } : {}),
      ...(consolidation !== undefined ? { consolidation } : {}),
    };
  }
}
