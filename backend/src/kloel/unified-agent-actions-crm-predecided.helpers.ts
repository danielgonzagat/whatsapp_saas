import { Logger } from '@nestjs/common';

import type { ToolArgs } from './unified-agent.types';
import type { MindPolicyService } from './mind-policy.service';
import { resolveFollowupTimingDecision } from './mind-recovery-decision-resolvers';

import type { UnknownRecord } from '../common/types';

import { readStringOrUntrimmed as readString } from '../common/parse';
export interface FollowUpTimingResult {
  delayHours: number;
  meta: {
    baseline: string;
    chosen: string;
    outcomeKey?: string;
    reasonInternal?: string;
  };
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function nearestFollowUpBucket(
  requestedDelayHours: number,
  buckets: Record<string, number>,
): string {
  const [bucket] =
    Object.entries(buckets).sort(
      ([, left], [, right]) =>
        Math.abs(left - requestedDelayHours) - Math.abs(right - requestedDelayHours),
    )[0] ?? [];
  return bucket ?? 'immediate';
}

export async function chooseFollowUpTiming(input: {
  channel: string;
  contactId: string;
  logger: Logger;
  mindPolicy?: MindPolicyService;
  requestedDelayHours: number;
  workspaceId: string;
}): Promise<FollowUpTimingResult> {
  const buckets: Record<string, number> = {
    immediate: 0.08,
    short: 0.5,
    medium: 2,
    long: 8,
    next_day: 24,
  };
  const baseline = nearestFollowUpBucket(input.requestedDelayHours, buckets);

  if (!input.mindPolicy || !input.contactId) {
    return {
      delayHours: input.requestedDelayHours,
      meta: { baseline, chosen: 'legacy_requested_delay' },
    };
  }

  try {
    const timing = await resolveFollowupTimingDecision(
      input.mindPolicy,
      input.workspaceId,
      input.contactId,
      input.channel,
      input.requestedDelayHours,
      buckets,
    );
    return {
      delayHours: timing.delayHours,
      meta: {
        baseline,
        chosen: timing.bucket,
        ...(timing.outcomeKey !== undefined ? { outcomeKey: timing.outcomeKey } : {}),
        ...(timing.reasonInternal !== undefined ? { reasonInternal: timing.reasonInternal } : {}),
      },
    };
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown';
    input.logger.warn(`MIND follow-up timing fallback: ${msg}`);
    return {
      delayHours: input.requestedDelayHours,
      meta: { baseline, chosen: 'legacy_requested_delay' },
    };
  }
}

export function predecidedFollowUpTiming(
  args: ToolArgs,
  requestedDelayHours: number,
): FollowUpTimingResult {
  const timing = isRecord(args.followupTimingDecision) ? args.followupTimingDecision : {};
  const outcomeKey =
    typeof timing.outcomeKey === 'string' ? timing.outcomeKey : undefined;
  const meta: FollowUpTimingResult['meta'] = {
    baseline: 'orchestrator_predecided',
    chosen: readString(timing.chosen, readString(timing.bucket, 'orchestrator_predecided')),
    reasonInternal: 'orchestrator_predecided',
  };
  if (outcomeKey !== undefined) {
    meta.outcomeKey = outcomeKey;
  }
  return { delayHours: requestedDelayHours, meta };
}

export function predecidedHumanTransfer(args: ToolArgs): {
  action: string;
  confidence?: number;
  fallback?: boolean;
} {
  const decision = isRecord(args.handoffDecision) ? args.handoffDecision : {};
  const conf =
    typeof decision.confidence === 'number' && Number.isFinite(decision.confidence)
      ? decision.confidence
      : undefined;
  return {
    action: readString(decision.action, 'transfer_now'),
    ...(conf !== undefined ? { confidence: conf } : {}),
    fallback: decision.fallback === true,
  };
}
