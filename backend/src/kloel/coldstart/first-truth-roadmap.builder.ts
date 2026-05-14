/**
 * UTP-COLDSTART-002 — First-Truth Roadmap Builder.
 *
 * Generates a 30-day roadmap with milestones for workspaces in
 * NoHistoryMode. The roadmap serves as the cold-start execution plan.
 *
 * Pure function. Stateless.
 */
import { randomUUID } from 'node:crypto';
import type {
  FirstTruthRoadmap,
  MilestoneDay,
  NoHistoryMode,
  RoadmapMilestone,
} from './coldstart.types';
import {
  COLDSTART_ROADMAP_DURATION_DAYS,
  MILESTONE_LABELS,
  ROADMAP_MILESTONE_DAYS,
} from './coldstart.types';

export interface BuildRoadmapInput {
  readonly workspaceId: string;
  readonly noHistory: NoHistoryMode;
  readonly nowMs?: number | undefined;
}

export function buildFirstTruthRoadmap(input: BuildRoadmapInput): FirstTruthRoadmap {
  const nowMs = input.nowMs ?? Date.now();
  const now = new Date(nowMs).toISOString();
  const roadmapId = `roadmap_${randomUUID()}`;

  const milestones: RoadmapMilestone[] = ROADMAP_MILESTONE_DAYS.map(
    (day: MilestoneDay): RoadmapMilestone => ({
      day,
      label: MILESTONE_LABELS[day],
      completed: false,
    }),
  );

  return {
    roadmapId,
    workspaceId: input.workspaceId,
    createdAt: now,
    durationDays: COLDSTART_ROADMAP_DURATION_DAYS,
    milestones,
  };
}
