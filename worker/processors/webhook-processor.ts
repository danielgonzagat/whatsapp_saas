import { createHmac } from 'node:crypto';
import axios from 'axios';
import { type Job, Worker } from 'bullmq';
import { buildQueueOptions } from '../queue';
import { throwIfRetryable } from '../src/utils/error-handler';
import { validateUrl } from '../utils/ssrf-protection';
import { WorkerLogger } from '../logger';
import {
  checkIdempotent,
  endJob,
  logError,
  markCompleted,
  startJob,
} from '../processor-base';

const log = new WorkerLogger('webhook-worker');

/** Webhook worker. */
export const webhookWorker = new Worker(
  'webhook-jobs',
  async (job: Job) => {
    const meta = startJob(job, log);
    const ctxLog = log.withContext(meta.correlationId, meta.workspaceId);

    try {
      const dedup = await checkIdempotent(job);
      if (dedup) {
        ctxLog.info('job_skipped_idempotent', { jobId: job.id });
        endJob(meta, ctxLog, job.name, 'skipped');
        return { ok: true, skipped: true, reason: 'idempotent' };
      }

      const { url, payload, secret, event } = job.data;
      const timestamp = Date.now();

      const validation = await validateUrl(url);
      if (!validation.valid) {
        ctxLog.warn('webhook_ssrf_blocked', { url, error: validation.error });
        throw new Error(`SSRF blocked: ${validation.error}`);
      }

      const signature = secret
        ? createHmac('sha256', secret)
            .update(`${timestamp}.${JSON.stringify(payload)}`)
            .digest('hex')
        : '';

      await job.updateProgress(50);
      await axios.post(
        url,
        {
          event,
          timestamp,
          data: payload,
        },
        {
          headers: {
            'X-Webhook-Signature': signature,
            'X-Webhook-Event': event,
            'User-Agent': 'Kloel-Webhook-Dispatcher/1.0',
          },
          timeout: 10000,
        },
      );
      await job.updateProgress(100);
      await markCompleted(job);
      endJob(meta, ctxLog, job.name, 'completed');
    } catch (err: unknown) {
      logError(meta, ctxLog, err, job.name);
      ctxLog.error('webhook_failed', {
        url: job.data?.url,
        error: err instanceof Error ? err.message : String(err),
      });
      throwIfRetryable(err, 'webhook');
    }
  },
  { ...buildQueueOptions(), concurrency: 20, lockDuration: 60_000 },
);
