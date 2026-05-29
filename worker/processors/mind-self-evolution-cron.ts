/**
 * Mind Self-Evolution Cron Worker.
 *
 * Fires every 6h (override with MIND_SELF_EVOLUTION_CRON). Each tick posts to
 * the backend's `POST /internal/mind-self-evolution/trigger`, which fans out
 * across every workspace and asks `MindSelfModificationService.runEvolutionCycle`
 * to (1) build a self-modification proposal, (2) persist it as a
 * `RAC_MindOutboxEvent` row, (3) emit the proposal envelope on the spine.
 *
 * Mind is invisible — there is NO frontend surface. The cron is the only
 * scheduled trigger for the platform-wide self-evolution loop.
 *
 * Boot-time invariants:
 *   - The scheduler half (`addRepeatable`) only runs when `WORKER_ROLE !== 'executor'`.
 *   - The executor half (`new Worker(...)`) only runs when `WORKER_ROLE !== 'scheduler'`.
 *     Mirrors the autopilot/silent-24h pattern in processor.ts.
 *   - `INTERNAL_API_KEY` must be present; absence => log + skip job (no throw,
 *     so the worker process never crashes on bad config).
 *   - The backend POST has a hard 60s timeout; one slow workspace cannot stall
 *     the next cron tick because `concurrency: 1` + `lockDuration: 120_000`.
 */
import { type Job, Worker } from 'bullmq';
import { WorkerLogger } from '../logger';
import { buildQueueOptions, mindSelfEvolutionQueue } from '../queue';
import { checkIdempotent, endJob, logError, markCompleted, startJob } from '../processor-base';
import { getErrorMessage } from '../utils/error-message';

const QUEUE_NAME = 'mind-self-evolution';
const REPEATABLE_JOB_NAME = 'sweep-all';
const REPEATABLE_JOB_ID = 'mind-self-evolution-sweep-all';
const DEFAULT_CRON = '0 */6 * * *'; // every 6h at minute 0
const DEFAULT_BACKEND_TIMEOUT_MS = 60_000;
const ENV_TRIGGER_PATH_DEFAULT = '/internal/mind-self-evolution/trigger';

const log = new WorkerLogger(QUEUE_NAME);
const WORKER_ROLE = (process.env.WORKER_ROLE ?? 'all').toLowerCase();
const SHOULD_SCHEDULE = WORKER_ROLE !== 'executor';
const SHOULD_EXECUTE = WORKER_ROLE !== 'scheduler';

export interface MindSelfEvolutionTriggerResponse {
  ok: boolean;
  sweptWorkspaces: number;
  persisted: number;
  failed: number;
  sample: Array<{ workspaceId: string; eventId: string | null; opportunities: number }>;
}

function resolveBackendBaseUrl(): string {
  const configured =
    process.env.BACKEND_INTERNAL_URL ||
    process.env.BACKEND_PUBLIC_URL ||
    process.env.BACKEND_URL ||
    process.env.API_URL ||
    process.env.SERVICE_BASE_URL ||
    'http://localhost:3001';
  return configured.replace(/\/+$/, '');
}

function resolveTriggerPath(): string {
  return process.env.MIND_SELF_EVOLUTION_TRIGGER_PATH || ENV_TRIGGER_PATH_DEFAULT;
}

/**
 * POST to the backend trigger endpoint. Exported for the cycle spec so it can
 * be mocked without standing up the real worker process.
 */
export async function postBackendTrigger(
  fetchImpl: typeof fetch = fetch,
): Promise<MindSelfEvolutionTriggerResponse> {
  const internalKey = String(process.env.INTERNAL_API_KEY ?? '').trim();
  if (!internalKey) {
    throw new Error('INTERNAL_API_KEY not configured');
  }
  const baseUrl = resolveBackendBaseUrl();
  const url = `${baseUrl}${resolveTriggerPath()}`;

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), DEFAULT_BACKEND_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-key': internalKey,
      },
      body: JSON.stringify({}),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Backend trigger returned ${response.status}`);
    }
    const json = (await response.json()) as MindSelfEvolutionTriggerResponse;
    return json;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

/**
 * Idempotent scheduler — every boot tries to add the repeatable, but BullMQ
 * dedups on `jobId`, so multiple worker instances cannot multiply the cron.
 */
export async function scheduleMindSelfEvolutionCron(): Promise<void> {
  if (!SHOULD_SCHEDULE) {
    log.info('mind_self_evolution_cron_disabled_for_role', { role: WORKER_ROLE });
    return;
  }
  const pattern = process.env.MIND_SELF_EVOLUTION_CRON || DEFAULT_CRON;
  try {
    await mindSelfEvolutionQueue.add(
      REPEATABLE_JOB_NAME,
      {},
      {
        jobId: REPEATABLE_JOB_ID,
        repeat: { pattern },
        removeOnComplete: true,
      },
    );
    log.info('mind_self_evolution_cron_scheduled', { pattern, role: WORKER_ROLE });
  } catch (err: unknown) {
    log.warn('mind_self_evolution_cron_schedule_failed', { error: getErrorMessage(err) });
  }
}

export const mindSelfEvolutionWorker = SHOULD_EXECUTE
  ? new Worker(
      QUEUE_NAME,
      async (job: Job) => {
        const meta = startJob(job, log);
        const ctxLog = log.withContext(meta.correlationId, meta.workspaceId);
        try {
          const dedup = await checkIdempotent(job);
          if (dedup) {
            ctxLog.info('job_skipped_idempotent', { jobId: job.id });
            endJob(meta, ctxLog, job.name, 'skipped');
            return { ok: true, skipped: true };
          }

          if (!String(process.env.INTERNAL_API_KEY ?? '').trim()) {
            ctxLog.warn('mind_self_evolution_internal_key_missing');
            endJob(meta, ctxLog, job.name, 'skipped');
            return { ok: false, reason: 'internal_api_key_missing' };
          }

          const result = await postBackendTrigger();
          await markCompleted(job);
          const durationMs = endJob(meta, ctxLog, job.name, 'completed');
          ctxLog.info('mind_self_evolution_tick_completed', {
            sweptWorkspaces: result.sweptWorkspaces,
            persisted: result.persisted,
            failed: result.failed,
            durationMs,
          });
          return { ...result, ok: true, durationMs };
        } catch (err: unknown) {
          logError(meta, ctxLog, err, job.name);
          throw err;
        }
      },
      { ...buildQueueOptions(), concurrency: 1, lockDuration: 120_000 },
    )
  : null;

if (SHOULD_SCHEDULE) {
  void scheduleMindSelfEvolutionCron();
}
