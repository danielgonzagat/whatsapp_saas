/**
 * UTP-COLDSTART-007 — Progress Tracker.
 *
 * Compares workspace state against the FirstTruthRoadmap and produces
 * a ProgressSnapshot showing completion status of each milestone and
 * readiness for graduation.
 *
 * Pure function. Stateless.
 */
import type { SpineEventRef } from '../mind/mind.types';
import type {
  FirstTruthRoadmap,
  MicroTest,
  MilestoneDay,
  ProgressSnapshot,
} from './coldstart.types';
import { detectFirstTruth } from './first-truth.detector';

export interface TrackProgressInput {
  readonly roadmap: FirstTruthRoadmap;
  readonly events: readonly SpineEventRef[];
  readonly microTests: readonly MicroTest[];
  readonly nowMs?: number | undefined;
}

export function trackProgress(input: TrackProgressInput): ProgressSnapshot {
  const now = new Date(input.nowMs ?? Date.now()).toISOString();
  const { roadmap } = input;
  const workspaceId = roadmap.workspaceId;
  const workspaceTests = input.microTests.filter((t) => t.workspaceId === workspaceId);

  const truthResult = detectFirstTruth({
    events: input.events,
    microTests: workspaceTests,
    workspaceId,
    nowMs: input.nowMs,
  });

  const elapsedMs = (input.nowMs ?? Date.now()) - Date.parse(roadmap.createdAt);
  const currentDay = Math.min(
    roadmap.durationDays,
    Math.max(1, Math.ceil(elapsedMs / (24 * 60 * 60 * 1000))),
  );

  const completedMilestones = new Set<MilestoneDay>();
  const executedTestCount = workspaceTests.length;

  if (workspaceTests.length > 0) {
    completedMilestones.add(7);
    completedMilestones.add(1);
    completedMilestones.add(3);
  }

  if (executedTestCount > 0) {
    completedMilestones.add(14);
  }

  if (truthResult.truthEstablished) {
    completedMilestones.add(21);
  }

  if (truthResult.confidence >= 0.75 && executedTestCount >= 2) {
    completedMilestones.add(30);
  }

  const completedList = [...completedMilestones].sort((a, b) => a - b);
  const pendingList = roadmap.milestones
    .filter((m) => !completedMilestones.has(m.day))
    .map((m) => m.day);

  const readyForGraduation =
    completedMilestones.has(30) || (completedMilestones.has(21) && executedTestCount >= 2);

  const completedPct =
    roadmap.milestones.length > 0
      ? Math.round((completedMilestones.size / roadmap.milestones.length) * 100)
      : 0;

  return {
    workspaceId,
    roadmapId: roadmap.roadmapId,
    currentDay,
    totalDays: roadmap.durationDays,
    completedMilestones: completedList,
    pendingMilestones: pendingList,
    completedPct,
    microTestCount: workspaceTests.length,
    executedTestCount,
    hasFirstTruth: truthResult.truthEstablished,
    readyForGraduation,
    snapshotAt: now,
  };
}
