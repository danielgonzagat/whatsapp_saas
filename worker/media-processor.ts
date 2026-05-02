import { type Job, Worker } from 'bullmq';
import { prisma } from './db';
import { connection } from './queue';
import { isRetryableError, WorkerError } from './src/utils/error-handler';

/** Media worker. */
export const mediaWorker = new Worker(
  'media-jobs',
  async (job: Job) => {
    console.log(`\n🎬 [MEDIA] Processing job ${job.id}`);

    try {
      const { jobId, prompt } = job.data || {};

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

      // Placeholder de geração: em prod, chamar provedor de vídeo/IA
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
      console.log(`✅ [MEDIA] Job ${jobId} completed`);
    } catch (err) {
      console.error(`❌ [MEDIA] Job ${job.id} failed:`, err);
      if (job.data?.jobId) {
        await prisma.mediaJob
          .update({
            where: { id: job.data.jobId },
            data: { status: 'FAILED' },
          })
          .catch((updateErr) =>
            console.error(
              '[media-processor] mark_job_failed_error',
              updateErr?.message || String(updateErr),
            ),
          );
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
  { connection, concurrency: 5 },
);
