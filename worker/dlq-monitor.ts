import { Queue } from "bullmq";
import { queueRegistry, queueOptions } from "./queue";

const OPS_WEBHOOK =
  process.env.OPS_WEBHOOK_URL || process.env.DLQ_WEBHOOK_URL || process.env.AUTOPILOT_ALERT_WEBHOOK;
const INTERVAL =
  Number(process.env.DLQ_MONITOR_INTERVAL_MS || 5 * 60_000); // default 5 min

// Avoid noisy alerts
const lastAlert: Record<string, number> = {};
const ALERT_COOLDOWN = Number(process.env.DLQ_ALERT_COOLDOWN_MS || 10 * 60_000);

async function notify(queue: string, waiting: number, failed: number) {
  if (!OPS_WEBHOOK || !(global as any).fetch) return;
  const now = Date.now();
  if (lastAlert[queue] && now - lastAlert[queue] < ALERT_COOLDOWN) return;

  try {
    await (global as any).fetch(OPS_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "dlq_alert",
        queue,
        waiting,
        failed,
        at: new Date().toISOString(),
        env: process.env.NODE_ENV || "dev",
      }),
    });
    lastAlert[queue] = now;
  } catch (err: any) {
    console.warn("[DLQ Monitor] notify failed:", err?.message);
  }
}

async function healQueue(dlqName: string, originalQueueName: string) {
  const dlq = new Queue(dlqName, queueOptions);
  const originalQueue = new Queue(originalQueueName, queueOptions);
  
  const jobs = await dlq.getJobs(['waiting', 'delayed', 'active'], 0, 20);
  if (jobs.length === 0) return;

  const TRANSIENT_ERRORS = [
    'ETIMEDOUT',
    'ECONNRESET',
    'EADDRINUSE',
    'socket hang up',
    'network timeout',
    '502 Bad Gateway',
    '503 Service Unavailable',
    '504 Gateway Timeout',
    'rate limit',
    'too many requests',
    'Deadlock found',
    'Connection terminated',
  ];

  for (const job of jobs) {
    const reason = (job.data?.failedReason || job.failedReason || '').toLowerCase();
    const isTransient = TRANSIENT_ERRORS.some(err => reason.includes(err.toLowerCase()));
    
    // Heal logic: If transient, retry immediately (move back to main queue)
    // Limit retries to avoid infinite loops: check if we already healed this job ID before?
    // For now, we trust the main queue retry count. But since we are in DLQ, main retries were exhausted.
    // We give it a "second chance" batch (e.g. 3 more attempts).
    
    if (isTransient) {
      console.log(`[Self-Healing] Rescuing job ${job.id} from ${dlqName} (Reason: ${reason})`);
      
      // Re-add to original queue with fresh attempts
      await originalQueue.add(job.data.jobName || 'restored-job', job.data.data, {
        attempts: 3, // Give 3 fresh attempts
        backoff: { type: 'exponential', delay: 5000 }
      });
      
      // Remove from DLQ
      await job.remove();
    }
  }
}

async function checkDlqs() {
  // queueRegistry is an array of Queues. We need to access their names.
  // Importing queueRegistry as 'any' to bypass potential type strictness on iteration if it's an array
  const queues = queueRegistry as any[]; 

  for (const queue of queues) {
    const name = queue.name; // e.g. 'flow-jobs'
    const dlqName = `${name}-dlq`;
    
    try {
      // 1. Attempt Self-Healing first
      await healQueue(dlqName, name);

      // 2. Monitor leftovers
      const dlq = new Queue(dlqName, queueOptions);
      const counts = await dlq.getJobCounts();
      const waiting = (counts.waiting || 0) + (counts.delayed || 0);
      const failed = counts.failed || 0;
      
      if (waiting > 0 || failed > 0) {
        await notify(dlqName, waiting, failed);
      }
    } catch (err: any) {
      console.warn("[DLQ Monitor] error checking/healing", dlqName, err?.message);
    }
  }
}

setInterval(checkDlqs, INTERVAL);
void checkDlqs();
