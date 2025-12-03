import { Queue } from "bullmq";
import { connection } from "./queue";

async function retryFailedJobs() {
  const queue = new Queue("flow-jobs", { connection });
  
  const failed = await queue.getFailed();
  console.log(`Found ${failed.length} failed jobs.`);

  for (const job of failed) {
    console.log(`Retrying job ${job.id}...`);
    await job.retry();
  }

  console.log("Done.");
  process.exit(0);
}

retryFailedJobs().catch(console.error);
