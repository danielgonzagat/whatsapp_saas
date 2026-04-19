import { Queue } from 'bullmq';
import { connection } from './queue';
import { forEachSequential } from './utils/async-sequence';

async function retryFailedJobs() {
  const queue = new Queue('flow-jobs', { connection });

  const failed = await queue.getFailed();
  console.log(`Found ${failed.length} failed jobs.`);

  await forEachSequential(failed, async (job) => {
    console.log(`Retrying job ${job.id}...`);
    await job.retry();
  });

  console.log('Done.');
  process.exit(0);
}

retryFailedJobs().catch(console.error);
