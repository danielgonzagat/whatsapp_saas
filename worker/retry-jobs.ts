import { Queue } from 'bullmq';
import { connection } from './queue';

async function retryFailedJobs() {
  const queue = new Queue('flow-jobs', { connection });

  const failed = await queue.getFailed();
  console.log(`Found ${failed.length} failed jobs.`);

  // biome-ignore lint/performance/noAwaitInLoops: BullMQ failed-job rehydration — each job.retry() acquires a Redis lock on the BullMQ queue and moves the job back to active; parallel retries would stampede the connection and trigger RedisError: MAXCLIENTS reached
  for (const job of failed) {
    console.log(`Retrying job ${job.id}...`);
    await job.retry();
  }

  console.log('Done.');
  process.exit(0);
}

retryFailedJobs().catch(console.error);
