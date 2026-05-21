/**
 * UTP-COLDSTART-001 — No-History Mode Detector.
 *
 * Identifies workspaces with insufficient commercial events and marks
 * them as NoHistoryMode. Used by the roadmap builder to decide whether
 * to enter cold-start flow.
 *
 * Pure function. Stateless. Input: events + workspaceId → verdict.
 */
import type { SpineEventRef } from '../mind/mind.types';
import type { NoHistoryMode } from './coldstart.types';
import {
  COLDSTART_EVENT_NAMES,
  DEFAULT_OBSERVATION_WINDOW_DAYS,
  MIN_EVENTS_FOR_NO_HISTORY_MODE,
  withinWindowDays,
} from './coldstart.types';

export interface DetectNoHistoryInput {
  readonly events: readonly SpineEventRef[];
  readonly workspaceId: string;
  readonly nowMs?: number | undefined;
  readonly threshold?: number | undefined;
  readonly windowDays?: number | undefined;
}

export function detectNoHistoryMode(input: DetectNoHistoryInput): NoHistoryMode {
  const windowDays = input.windowDays ?? DEFAULT_OBSERVATION_WINDOW_DAYS;
  const threshold = input.threshold ?? MIN_EVENTS_FOR_NO_HISTORY_MODE;
  const nowMs = input.nowMs ?? Date.now();
  const now = new Date(nowMs).toISOString();

  const relevant = input.events.filter(
    (e) =>
      e.workspaceId === input.workspaceId &&
      COLDSTART_EVENT_NAMES.has(e.eventName) &&
      withinWindowDays(e.occurredAt, nowMs, windowDays),
  );

  const totalEventsInWindow = relevant.length;
  const isNoHistory = totalEventsInWindow < threshold;

  const reason = isNoHistory
    ? `apenas ${totalEventsInWindow} eventos comerciais nos ultimos ${windowDays} dias (minimo: ${threshold})`
    : undefined;

  return {
    workspaceId: input.workspaceId,
    isNoHistory,
    totalEventsInWindow,
    observationWindowDays: windowDays,
    activatedAt: now,
    reason,
  };
}
