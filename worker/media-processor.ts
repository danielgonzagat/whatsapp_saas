import { type Job, Worker } from 'bullmq';
import { prisma } from './db';
import { buildQueueOptions } from './queue';
import { isRetryableError, WorkerError } from './src/utils/error-handler';
import { WorkerLogger } from './logger';
import {
  checkIdempotent,
  endJob,
  logError,
  markCompleted,
  startJob,
} from './processor-base';

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

      await job.updateProgress(50);
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const outputUrl = process.env.CDN_BASE_URL
        ? `${process.env.CDN_BASE_URL}/media/${jobId}.mp4`
        : `${process.env.APP_URL || 'http://localhost:3001'}/uploads/media/${jobId}.mp4`;

      await job.updateProgress(90);
      await prisma.mediaJob.updateMany({
        where: { id: jobId, workspaceId: record.workspaceId },
        data: {
          status: 'COMPLETED',
          outputUrl,
          prompt: prompt || undefined,
        },
      });

      await job.updateProgress(100);
      await markCompleted(job);
      endJob(meta, ctxLog, job.name, 'completed');
      ctxLog.info('media_job_complete', { jobId });
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
