import { randomUUID } from 'node:crypto';
import { type Job } from 'bullmq';
import { WorkerLogger } from './logger';
import { redis } from './redis-client';

/**
 * Structured job lifecycle helpers shared by all BullMQ processors.
 *
 * Each processor handler is expected to:
 * 1. Generate a correlationId
 * 2. Log start (correlationId, workspaceId, jobId)
 * 3. Check idempotency via dedup key
 * 4. Execute handler
 * 5. Log end (durationMs, status)
 */

const DEDUP_KEY_PREFIX = 'job:dedup:';
const DEFAULT_DEDUP_TTL = 86_400; // 24h

export interface JobMeta {
  correlationId: string;
  workspaceId: string;
  start: bigint;
}

export function generateCorrelationId(): string {
  return randomUUID();
}

export function extractWorkspaceId(job: Job): string {
  const d = job.data as Record<string, unknown> | undefined;
  if (!d) {
    return 'unknown';
  }
  if (typeof d.workspaceId === 'string') {
    return d.workspaceId;
  }
  if (d.workspace && typeof d.workspace === 'object' && !Array.isArray(d.workspace)) {
    const ws = d.workspace as Record<string, unknown>;
    if (typeof ws.id === 'string') {
      return ws.id;
    }
  }
  return 'unknown';
}

function buildDedupKey(job: Job): string {
  const dedupId =
    (job.data as Record<string, unknown> | undefined)?.dedupKey ?? job.id ?? 'unknown';
  return `${DEDUP_KEY_PREFIX}${job.queueName}:${String(dedupId)}`;
}

export async function checkIdempotent(job: Job): Promise<boolean> {
  const key = buildDedupKey(job);
  try {
    const existing = await redis.get(key);
    return existing === '1';
  } catch {
    return false;
  }
}

export async function markCompleted(job: Job, ttl = DEFAULT_DEDUP_TTL): Promise<void> {
  const key = buildDedupKey(job);
  try {
    await redis.set(key, '1', 'EX', ttl);
  } catch {
    // best-effort
  }
}

export function startJob(job: Job, log: WorkerLogger): JobMeta {
  const correlationId = generateCorrelationId();
  const workspaceId = extractWorkspaceId(job);
  log.info('job_start', {
    correlationId,
    jobId: job.id,
    name: job.name,
    queue: job.queueName,
    workspaceId,
  });
  return { correlationId, workspaceId, start: process.hrtime.bigint() };
}

export function endJob(
  meta: JobMeta,
  log: WorkerLogger,
  jobName: string,
  status: 'completed' | 'failed' | 'skipped',
): number {
  const durationMs = Number(process.hrtime.bigint() - meta.start) / 1e6;
  log.info('job_end', {
    correlationId: meta.correlationId,
    workspaceId: meta.workspaceId,
    durationMs: Math.round(durationMs),
    status,
    jobName,
  });
  return durationMs;
}

export function logError(meta: JobMeta, log: WorkerLogger, err: unknown, jobName: string): number {
  const durationMs = Number(process.hrtime.bigint() - meta.start) / 1e6;
  log.error('job_error', {
    correlationId: meta.correlationId,
    workspaceId: meta.workspaceId,
    durationMs: Math.round(durationMs),
    error: err instanceof Error ? err.message : String(err),
    jobName,
  });
  return durationMs;
}
