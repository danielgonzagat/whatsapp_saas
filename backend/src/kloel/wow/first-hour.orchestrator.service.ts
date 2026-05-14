/**
 * UTP-WOW-006 — First-Hour Orchestrator Service.
 *
 * Orchestrates the complete first-hour value shock pipeline:
 *   ingest → detect → rank → evidence → filter → deliver.
 *
 * The orchestrator wires together all WOW sub-services and
 * produces an OrchestrationOutcome with full traceability.
 *
 * Delivery is limited to dashboard (via outcome structure) and
 * whatsapp (future channel) — the first hour targets the workspace
 * owner's immediate experience.
 *
 * Implements B0.2 + B0.5 from the Cognitive Organism Plan.
 */

import { Injectable } from '@nestjs/common';
import type { SpineEventRef } from '../mind/mind.types';
import { ColdStartIngestionService } from './cold-start-ingestion.service';
import { PatternDetectorService } from './pattern-detector.service';
import { rankWOWInsights } from './insight-ranker';
import { buildEvidenceBundles } from './evidence-builder';
import { filterAboveWOWFloor } from './confidence-floor';
import {
  MAX_FIRST_HOUR_INSIGHTS,
  type FirstHourDeliveryDecision,
  type FirstHourPattern,
  type OrchestrationOutcome,
  type RankedWOWInsight,
} from './wow.types';

@Injectable()
export class FirstHourOrchestratorService {
  public constructor(
    private readonly ingestionService: ColdStartIngestionService,
    private readonly patternDetector: PatternDetectorService,
  ) {}

  /**
   * Run the full first-hour pipeline for a workspace.
   *
   * @param events — available spine events (from ring buffer or replay source)
   * @param workspaceId — target workspace
   * @returns OrchestrationOutcome with all pipeline artifacts
   */
  public orchestrate(input: {
    readonly events: readonly SpineEventRef[];
    readonly workspaceId: string;
    readonly nowMs?: number;
    readonly maxInsights?: number;
  }): OrchestrationOutcome {
    const startedAt = Date.now();
    const maxInsights = input.maxInsights ?? MAX_FIRST_HOUR_INSIGHTS;

    const ingestion = this.ingestionService.ingest({
      events: input.events,
      workspaceId: input.workspaceId,
      ...(input.nowMs !== undefined ? { nowMs: input.nowMs } : {}),
    });

    const rawPattern = this.patternDetector.detect(ingestion);

    const ranked = rankWOWInsights(rawPattern.insights, rawPattern.maturityVerdict.stage);

    const pattern: FirstHourPattern = {
      ...rawPattern,
      rankedInsights: ranked,
    };

    const { passed, blocked, blockedReasons } = filterAboveWOWFloor(ranked);

    const capped = passed.slice(0, maxInsights);

    const deliveredEvidence = buildEvidenceBundles(capped);

    const durationMs = Date.now() - startedAt;

    return {
      workspaceId: input.workspaceId,
      ingestion,
      pattern,
      deliveredEvidence: deliveredEvidence,
      blockedInsightCount: blocked.length,
      blockedReasons,
      acknowledged: false,
      orchestratedAt: new Date().toISOString(),
      orchestrationDurationMs: durationMs,
    };
  }

  /**
   * Compute delivery decisions for ranked insights.
   * First-hour delivery uses only 'dashboard' channel and 'now' timing.
   * Insights below confidence floor or beyond the cap are not delivered.
   */
  public deliveryDecisions(
    insights: readonly RankedWOWInsight[],
    maxInsights?: number,
  ): readonly FirstHourDeliveryDecision[] {
    const max = maxInsights ?? MAX_FIRST_HOUR_INSIGHTS;
    const { passed, blocked } = filterAboveWOWFloor(insights);

    const decisions: FirstHourDeliveryDecision[] = [];

    for (let i = 0; i < passed.length; i++) {
      const insight = passed[i] as RankedWOWInsight;
      if (i < max) {
        decisions.push({
          insight,
          deliver: true,
          channel: 'dashboard',
          timing: 'now',
        });
      } else {
        decisions.push({
          insight,
          deliver: false,
          reason: `exceeded max first-hour insights (${max})`,
          channel: 'dashboard',
          timing: 'now',
        });
      }
    }

    for (const insight of blocked) {
      decisions.push({
        insight,
        deliver: false,
        reason: 'blocked by confidence floor',
        channel: 'dashboard',
        timing: 'now',
      });
    }

    return decisions;
  }

  /**
   * Acknowledge delivery — marks the orchestration outcome as
   * acknowledged by the workspace owner.
   */
  public acknowledge(outcome: OrchestrationOutcome): OrchestrationOutcome {
    return { ...outcome, acknowledged: true };
  }
}
