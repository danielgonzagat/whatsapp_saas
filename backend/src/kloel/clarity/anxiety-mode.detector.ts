/**
 * UTP-CLARITY-004 — Anxiety Mode Detector.
 *
 * Detects when the operator is overwhelmed and collapses
 * the decision space to AGORA-only mode. Triggers based on:
 * overload factor, urgent item count, and decision backlog.
 *
 * Pure function — stateless detection from trigger input.
 */

import type { AnxietyMode, AnxietyTrigger } from './clarity.types';
import {
  ANXIETY_BACKLOG_THRESHOLD,
  ANXIETY_COOLDOWN_MS,
  ANXIETY_OVERLOAD_FACTOR_THRESHOLD,
  ANXIETY_URGENT_COUNT_THRESHOLD,
} from './clarity.types';

export interface AnxietyDetection {
  readonly mode: AnxietyMode;
  readonly shouldActivate: boolean;
  readonly shouldDeactivate: boolean;
  readonly reasons: readonly string[];
}

export function detectAnxietyMode(
  trigger: AnxietyTrigger,
  currentMode: AnxietyMode,
): AnxietyDetection {
  const reasons: string[] = [];
  let shouldActivate = false;
  let shouldDeactivate = false;

  if (currentMode.active) {
    const cooldownEnd = currentMode.cooldownUntil
      ? Date.parse(currentMode.cooldownUntil)
      : 0;
    if (
      Number.isFinite(cooldownEnd) &&
      cooldownEnd > 0 &&
      trigger.nowMs >= cooldownEnd
    ) {
      shouldDeactivate = true;
      reasons.push('cooldown expired');
    }

    if (
      trigger.overloadFactor < ANXIETY_OVERLOAD_FACTOR_THRESHOLD &&
      trigger.urgentItemCount < ANXIETY_URGENT_COUNT_THRESHOLD &&
      trigger.decisionBacklog < ANXIETY_BACKLOG_THRESHOLD
    ) {
      shouldDeactivate = true;
      reasons.push('all metrics below anxiety thresholds');
    }
  } else {
    const overloadTriggered =
      trigger.overloadFactor >= ANXIETY_OVERLOAD_FACTOR_THRESHOLD;
    const urgentTriggered =
      trigger.urgentItemCount >= ANXIETY_URGENT_COUNT_THRESHOLD;
    const backlogTriggered =
      trigger.decisionBacklog >= ANXIETY_BACKLOG_THRESHOLD;

    const triggerCount = [
      overloadTriggered,
      urgentTriggered,
      backlogTriggered,
    ].filter(Boolean).length;

    if (triggerCount >= 2) {
      shouldActivate = true;
      if (overloadTriggered)
        reasons.push(
          `overload ${trigger.overloadFactor} >= ${ANXIETY_OVERLOAD_FACTOR_THRESHOLD}`,
        );
      if (urgentTriggered)
        reasons.push(
          `urgent items ${trigger.urgentItemCount} >= ${ANXIETY_URGENT_COUNT_THRESHOLD}`,
        );
      if (backlogTriggered)
        reasons.push(
          `backlog ${trigger.decisionBacklog} >= ${ANXIETY_BACKLOG_THRESHOLD}`,
        );
    }
  }

  let mode: AnxietyMode;

  if (shouldActivate) {
    mode = {
      active: true,
      triggeredAt: new Date(trigger.nowMs).toISOString(),
      triggerReason: reasons.join('; ') || null,
      cooldownUntil: new Date(
        trigger.nowMs + ANXIETY_COOLDOWN_MS,
      ).toISOString(),
    };
  } else if (shouldDeactivate) {
    mode = {
      active: false,
      triggeredAt: currentMode.triggeredAt,
      triggerReason: null,
      cooldownUntil: null,
    };
  } else {
    mode = currentMode;
  }

  return {
    mode,
    shouldActivate,
    shouldDeactivate,
    reasons,
  };
}
