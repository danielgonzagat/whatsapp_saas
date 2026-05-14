import { type Job, Worker } from 'bullmq';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { prisma } from '../db';
import { WorkerLogger } from '../logger';
import { buildQueueOptions } from '../queue';
import { checkIdempotent, endJob, logError, markCompleted, startJob } from '../processor-base';

const log = new WorkerLogger('mind-lift-report');

const OUTCOME_WEIGHTS: Record<string, number> = {
  'inbound.received': 0.5,
  'payment.succeeded': 1.0,
  'checkout.abandoned': -0.3,
  'coupon.redeemed': 0.7,
  'conversation.handed_off': 0.6,
  'contact.opted_out': -1.0,
  'payment.refunded': -0.5,
  'subscription.canceled': -0.8,
  'inbound.silent_24h': -0.1,
};

function wilsonInterval(
  successes: number,
  trials: number,
  z = 1.96,
): { lower: number; upper: number } {
  if (trials === 0) {
    return { lower: 0, upper: 0 };
  }
  const p = successes / trials;
  const denominator = 1 + (z * z) / trials;
  const centre = (p + (z * z) / (2 * trials)) / denominator;
  const margin =
    (z / denominator) * Math.sqrt((p * (1 - p)) / trials + (z * z) / (4 * trials * trials));
  return { lower: Math.max(0, centre - margin), upper: Math.min(1, centre + margin) };
}

function extractChannel(contextSnapshot: unknown): string {
  if (contextSnapshot && typeof contextSnapshot === 'object' && !Array.isArray(contextSnapshot)) {
    const ctx = contextSnapshot as Record<string, unknown>;
    return String(ctx.channel ?? ctx.source ?? 'unknown');
  }
  return 'unknown';
}

export const mindLiftReportWorker = new Worker(
  'mind-lift-report',
  async (job: Job) => {
    const meta = startJob(job, log);
    const ctxLog = log.withContext(meta.correlationId, meta.workspaceId);

    try {
      const dedup = await checkIdempotent(job);
      if (dedup) {
        ctxLog.info('job_skipped_idempotent', { jobId: job.id });
        endJob(meta, ctxLog, job.name, 'skipped');
        return { ok: true, skipped: true };
      }

      const sinceDays = (job.data as { sinceDays?: number } | undefined)?.sinceDays ?? 14;
      const since = new Date(Date.now() - sinceDays * 86400 * 1000);

      // @AllowCrossWorkspace: decisionOutcome.findMany is scoped by a non-workspace unique identifier, provider callback key, admin session owner, or platform worker claim.
      const rows = await prisma.decisionOutcome.findMany({
        where: { outcomeAt: { not: null, gte: since } },
        orderBy: { outcomeAt: 'desc' },
      });

      const grouped = new Map<
        string,
        Array<{ outcomeName: string | null; wonVsBaseline: boolean | null }>
      >();
      for (const row of rows) {
        const channel = extractChannel(row.contextSnapshot);
        const key = `${row.decisionType}:${channel}`;
        const entry = grouped.get(key) ?? [];
        entry.push({ outcomeName: row.outcomeName, wonVsBaseline: row.wonVsBaseline });
        grouped.set(key, entry);
      }

      const lines: string[] = [];
      lines.push('# MIND Lift Report');
      lines.push('');
      lines.push(`Generated: ${new Date().toISOString()}`);
      lines.push(`Window: ${sinceDays} days`);
      lines.push(`Decision-channel pairs: ${grouped.size}`);
      lines.push('');
      lines.push(
        '| Decision Type | Channel | Total | Closed | Success Rate | 95% CI | Won vs Baseline |',
      );
      lines.push(
        '|---------------|---------|-------|--------|-------------|--------|----------------|',
      );

      for (const [key, outcomes] of grouped.entries()) {
        const [decisionType, channel] = key.split(':');
        const total = outcomes.length;
        const closed = outcomes.filter((o) => o.outcomeName !== null).length;
        const successCount = outcomes.filter((o) => {
          const weight = o.outcomeName ? (OUTCOME_WEIGHTS[o.outcomeName] ?? 0) : 0;
          return weight >= 0.3;
        }).length;
        const successRate = total > 0 ? successCount / total : 0;
        const ci = wilsonInterval(successCount, total);
        const wonCount = outcomes.filter((o) => o.wonVsBaseline === true).length;
        const wonRate = total > 0 ? wonCount / total : 0;
        const ciStr = `${(ci.lower * 100).toFixed(1)}%-${(ci.upper * 100).toFixed(1)}%`;
        lines.push(
          `| ${decisionType} | ${channel} | ${total} | ${closed} | ${(successRate * 100).toFixed(1)}% | ${ciStr} | ${(wonRate * 100).toFixed(1)}% |`,
        );
      }

      const markdown = lines.join('\n');
      const date = new Date().toISOString().split('T')[0];
      const dir = join(process.cwd(), '..', 'artifacts', 'mind-reports');
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, `${date}.md`), markdown, 'utf-8');

      ctxLog.info('lift_report_generated', { pairs: grouped.size, date, sinceDays });

      await markCompleted(job);
      endJob(meta, ctxLog, job.name, 'completed');
      return { ok: true, pairs: grouped.size };
    } catch (err: unknown) {
      logError(meta, ctxLog, err, job.name);
      throw err;
    }
  },
  { ...buildQueueOptions(), concurrency: 1, lockDuration: 120_000 },
);
