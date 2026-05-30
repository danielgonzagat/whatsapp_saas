/**
 * @capability MediaProcessor
 * @domain media-content
 */
import { type Job, Worker } from 'bullmq';
import { prisma } from './db';
import { buildQueueOptions } from './queue';
import { isRetryableError, WorkerError } from './src/utils/error-handler';
import { WorkerLogger } from './logger';
import { checkIdempotent, endJob, logError, startJob } from './processor-base';

const log = new WorkerLogger('media-worker');

/** Media worker. */
export const mediaWorker = new Worker(
  'media-jobs',
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

      const { jobId, prompt } = job.data || {};
      ctxLog.info('media_job_start', { jobId });

      await job.updateProgress(5);
      const record = await prisma.mediaJob.findUnique({
        where: { id: jobId },
        select: { workspaceId: true },
      });
      if (!record) {
        throw new WorkerError(`Media job ${jobId} not found`, 'MEDIA_JOB_NOT_FOUND', false);
      }

      await job.updateProgress(10);
      await prisma.mediaJob.updateMany({
        where: { id: jobId, workspaceId: record.workspaceId },
        data: { status: 'PROCESSING' },
      });

      // No video-rendering provider is integrated in this codebase yet. Rather
      // than fabricating an output URL pointing at a non-existent .mp4 (which
      // surfaces a dead link to the user), terminate the job in an honest
      // FAILED state with an explicit unavailable reason. The UI reads
      // status === 'FAILED' + null outputUrl as a setup-required/failed state.
      // When a real renderer adapter ships, wire it here (call provider with a
      // timeout + error handling, then persist the REAL outputUrl) and switch
      // this path to status 'COMPLETED'.
      const unavailableReason = 'media_renderer_unavailable';

      await job.updateProgress(90);
      await prisma.mediaJob.updateMany({
        where: { id: jobId, workspaceId: record.workspaceId },
        data: {
          status: 'FAILED',
          outputUrl: null,
          prompt: prompt || undefined,
        },
      });

      await job.updateProgress(100);
      endJob(meta, ctxLog, job.name, 'failed');
      ctxLog.warn('media_job_unavailable', { jobId, reason: unavailableReason });
      return { ok: false, status: 'unavailable', reason: unavailableReason };
    } catch (err) {
      logError(meta, ctxLog, err, job.name);
      if (job.data?.jobId) {
        await prisma.mediaJob
          .update({
            where: { id: job.data.jobId },
            data: { status: 'FAILED' },
          })
          .catch(() => {});
      }

      if (!isRetryableError(err)) {
        throw new WorkerError(
          err instanceof Error ? err.message : String(err),
          'MEDIA_PERMANENT',
          false,
        );
      }

      throw err;
    }
  },
  { ...buildQueueOptions(), concurrency: 5, lockDuration: 120_000 },
);
