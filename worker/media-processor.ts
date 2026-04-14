import { type Job, Worker } from 'bullmq';
import { prisma } from './db';
import { connection } from './queue';

export const mediaWorker = new Worker(
  'media-jobs',
  async (job: Job) => {
    console.log(`\n🎬 [MEDIA] Processing job ${job.id}`);

    try {
      const { jobId, prompt } = job.data || {};

      const record = await prisma.mediaJob.findUnique({
        where: { id: jobId },
        select: { workspaceId: true },
      });
      if (!record) {
        throw new Error(`Media job ${jobId} not found`);
      }

      await prisma.mediaJob.updateMany({
        where: { id: jobId, workspaceId: record.workspaceId },
        data: { status: 'PROCESSING' },
      });

      // Placeholder de geração: em prod, chamar provedor de vídeo/IA
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const outputUrl = process.env.CDN_BASE_URL
        ? `${process.env.CDN_BASE_URL}/media/${jobId}.mp4`
        : `${process.env.APP_URL || 'http://localhost:3001'}/uploads/media/${jobId}.mp4`;

      await prisma.mediaJob.updateMany({
        where: { id: jobId, workspaceId: record.workspaceId },
        data: {
          status: 'COMPLETED',
          outputUrl,
          prompt: prompt || undefined,
        },
      });

      console.log(`✅ [MEDIA] Job ${jobId} completed`);
    } catch (err) {
      console.error(`❌ [MEDIA] Job ${job.id} failed:`, err);
      if (job.data?.jobId) {
        await prisma.mediaJob
          .update({
            where: { id: job.data.jobId },
            data: { status: 'FAILED' },
          })
          .catch((err) =>
            console.error('[media-processor] mark_job_failed_error', err?.message || String(err)),
          );
      }
      throw err;
    }
  },
  { connection, concurrency: 5 },
);
