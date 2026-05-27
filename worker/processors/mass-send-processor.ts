import { randomInt } from 'node:crypto';
import { type Job, Worker } from 'bullmq';
import { buildQueueOptions, flowQueue } from '../queue';
import { checkIdempotent, endJob, logError, markCompleted, startJob } from '../processor-base';
import { WorkerLogger } from '../logger';
import { isRetryableError, WorkerError } from '../src/utils/error-handler';

const log = new WorkerLogger('mass-send-worker');

const MASS_SEND_JITTER_MIN_MS = Math.max(
  0,
  Number(process.env.MASS_SEND_JITTER_MIN_MS || 5000) || 5000,
);
const MASS_SEND_JITTER_MAX_MS = Math.max(
  MASS_SEND_JITTER_MIN_MS,
  Number(process.env.MASS_SEND_JITTER_MAX_MS || 15000) || 15000,
);

function scheduleDelay(previousDelay: number): number {
  const spread = MASS_SEND_JITTER_MAX_MS - MASS_SEND_JITTER_MIN_MS;
  const jitter = MASS_SEND_JITTER_MIN_MS + (spread > 0 ? randomInt(spread + 1) : 0);
  return previousDelay + jitter;
}

interface MassSendJobData {
  workspaceId: string;
  user: string;
  numbers: string[];
  message: string;
}

function buildSendMessageJobs(data: MassSendJobData) {
  let cumulativeDelay = 0;
  return data.numbers.map((phone) => {
    cumulativeDelay = scheduleDelay(cumulativeDelay);
    return {
      name: 'send-message',
      data: {
        workspaceId: data.workspaceId,
        to: phone,
        user: phone,
        message: data.message,
      },
      opts: {
        removeOnComplete: true,
        attempts: 3,
        backoff: { type: 'exponential' as const, delay: 5000 },
        delay: cumulativeDelay,
      },
    };
  });
}

/** Mass-send worker — processes dispatch jobs from the mass-send queue. */
export const massSendWorker = new Worker(
  'mass-send',
  async (job: Job) => {
    const meta = startJob(job, log);
    const ctxLog = log.withContext(meta.correlationId, meta.workspaceId);

    try {
      const dedup = await checkIdempotent(job);
      if (dedup) {
        ctxLog.info('mass_send_skipped_idempotent', { jobId: job.id });
        endJob(meta, ctxLog, job.name, 'skipped');
        return { ok: true, skipped: true, reason: 'idempotent' };
      }

      const data = job.data as MassSendJobData;
      ctxLog.info('mass_send_processing', {
        workspaceId: data.workspaceId,
        recipientCount: data.numbers.length,
      });

      if (!data.numbers || data.numbers.length === 0) {
        throw new WorkerError('No recipients in mass-send job', 'MASS_SEND_NO_RECIPIENTS', false);
      }

      const jobs = buildSendMessageJobs(data);
      await flowQueue.addBulk(jobs);

      await markCompleted(job);
      const durationMs = endJob(meta, ctxLog, job.name, 'completed');
      ctxLog.info('mass_send_dispatched', {
        workspaceId: data.workspaceId,
        recipientCount: data.numbers.length,
        durationMs,
      });
      return { ok: true, dispatched: data.numbers.length };
    } catch (err) {
      logError(meta, ctxLog, err, job.name);

      if (!isRetryableError(err)) {
        throw new WorkerError(
          err instanceof Error ? err.message : String(err),
          'MASS_SEND_PERMANENT',
          false,
        );
      }

      throw err;
    }
  },
  { ...buildQueueOptions(), concurrency: 5, lockDuration: 60000 },
);
