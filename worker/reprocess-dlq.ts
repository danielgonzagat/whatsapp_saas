import { Queue, Job } from "bullmq";
import { connection } from "./queue";

/**
 * Reprocessa jobs do DLQ (<queue>-dlq) devolvendo-os para a fila original.
 * Use TARGET_QUEUE=<nome> e DLQ_REPROCESS_LIMIT=<n> para controlar.
 */
async function main() {
  const targetQueueName = process.env.TARGET_QUEUE || "flow-jobs";
  const limit = Number(process.env.DLQ_REPROCESS_LIMIT || 50);

  const dlqName = `${targetQueueName}-dlq`;
  const dlq = new Queue(dlqName, { connection });
  const target = new Queue(targetQueueName, { connection });

  const jobs: Job[] = await dlq.getJobs(["waiting", "delayed", "failed"], 0, limit - 1);
  console.log(`Found ${jobs.length} jobs in ${dlqName}. Requeueing to ${targetQueueName}...`);

  for (const job of jobs) {
    try {
      const data = job.data as any;
      const name = data?.jobName || "default";
      const payload = data?.data ?? data;
      const opts = data?.opts || {};

      await target.add(name, payload, opts);
      await job.remove();
      console.log(`✔ Requeued ${job.id} -> ${targetQueueName}:${name}`);
    } catch (err: any) {
      console.error(`✖ Failed to requeue ${job.id}:`, err?.message || err);
    }
  }

  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("DLQ reprocess error:", err);
  process.exit(1);
});
