import { type Job, Queue } from 'bullmq';
import { connection } from './queue';

/**
 * Reprocessa jobs do DLQ (<queue>-dlq) devolvendo-os para a fila original.
 * Use TARGET_QUEUE=<nome> e DLQ_REPROCESS_LIMIT=<n> para controlar.
 */
async function main() {
  const targetQueueName = process.env.TARGET_QUEUE || 'flow-jobs';
  const limit = Number(process.env.DLQ_REPROCESS_LIMIT || 50);
  const attempts = Math.max(1, Number(process.env.DLQ_REPROCESS_ATTEMPTS || 3) || 3);
  const backoffDelay = Math.max(1000, Number(process.env.DLQ_REPROCESS_BACKOFF_MS || 5000) || 5000);

  const dlqName = `${targetQueueName}-dlq`;
  const dlq = new Queue(dlqName, { connection });
  const target = new Queue(targetQueueName, { connection });

  const jobs: Job[] = await dlq.getJobs(['waiting', 'delayed', 'failed'], 0, limit - 1);
  console.log(`Found ${jobs.length} jobs in ${dlqName}. Requeueing to ${targetQueueName}...`);

  // biome-ignore lint/performance/noAwaitInLoops: sequential job processing
  for (const job of jobs) {
    try {
      const data = job.data as Record<string, unknown>;
      const name = typeof data?.jobName === 'string' ? data.jobName : 'default';
      const payload = data?.data ?? data;
      const opts = (data?.opts || {}) as Record<string, unknown>;

      await target.add(name, payload, {
        attempts: Math.max(Number(opts?.attempts || 0), attempts),
        backoff: (opts?.backoff as { type: string; delay: number }) || {
          type: 'exponential',
          delay: backoffDelay,
        },
      });
      await job.remove();
      console.log(`✔ Requeued ${job.id} -> ${targetQueueName}:${name}`);
    } catch (err: unknown) {
      const errInstanceofError =
        err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
      // PULSE:OK — Per-job requeue failure is non-critical; other jobs still processed
      console.error(`✖ Failed to requeue ${job.id}:`, errInstanceofError?.message || err);
    }
  }

  console.log('Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error('DLQ reprocess error:', err);
  process.exit(1);
});
