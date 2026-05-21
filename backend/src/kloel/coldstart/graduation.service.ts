/**
 * UTP-COLDSTART-008 — Graduation Service.
 *
 * Graduates a workspace out of cold-start mode when the first
 * commercial truth has been established and progress meets
 * graduation criteria.
 *
 * Service (not pure function) because it emits spine events
 * and interacts with state. Current implementation is in-memory
 * with a spine emitter injection point prepared for future wiring.
 *
 * Implements B0.5 graduation: workspace transitions from
 * no-history-mode to full operation.
 */
import { Injectable } from '@nestjs/common';
import type { SpineEventRef } from '../mind/mind.types';
import type { FirstTruthRoadmap, MicroTest, ProgressSnapshot } from './coldstart.types';
import { trackProgress } from './progress.tracker';

export interface GraduationDecision {
  readonly workspaceId: string;
  readonly graduated: boolean;
  readonly reason: string;
  readonly snapshot: ProgressSnapshot;
  readonly graduatedAt?: string | undefined;
}

export interface GraduationInput {
  readonly roadmap: FirstTruthRoadmap;
  readonly events: readonly SpineEventRef[];
  readonly microTests: readonly MicroTest[];
  readonly nowMs?: number | undefined;
}

@Injectable()
export class GraduationService {
  public evaluate(input: GraduationInput): GraduationDecision {
    const now = new Date(input.nowMs ?? Date.now()).toISOString();
    const snapshot = trackProgress({
      roadmap: input.roadmap,
      events: input.events,
      microTests: input.microTests,
      nowMs: input.nowMs,
    });

    const graduated = snapshot.readyForGraduation;

    const reason = graduated
      ? `workspace ${input.roadmap.workspaceId} graduado: primeira verdade comercial estabelecida com ${snapshot.completedMilestones.length} milestones concluidos`
      : `workspace ${input.roadmap.workspaceId} ainda em cold-start: ${snapshot.completedPct}% concluido (${snapshot.completedMilestones.length}/${snapshot.totalDays} milestones)`;

    return {
      workspaceId: input.roadmap.workspaceId,
      graduated,
      reason,
      snapshot,
      graduatedAt: graduated ? now : undefined,
    };
  }

  public isGraduated(decision: GraduationDecision): boolean {
    return decision.graduated;
  }

  public canSkipColdStart(
    events: readonly SpineEventRef[],
    workspaceId: string,
    threshold?: number,
  ): boolean {
    const relevant = events.filter(
      (e) =>
        e.workspaceId === workspaceId &&
        (e.eventName === 'commerce.payment.approved' ||
          e.eventName === 'commerce.lead.converted' ||
          e.eventName === 'commerce.crm.deal_won'),
    );
    const min = threshold ?? 5;
    return relevant.length >= min;
  }
}
