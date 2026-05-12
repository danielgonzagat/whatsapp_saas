import { type Job, Worker } from 'bullmq';
import { prisma } from '../db';
import { WorkerLogger } from '../logger';
import { buildQueueOptions } from '../queue';
import { checkIdempotent, endJob, logError, markCompleted, startJob } from '../processor-base';

const OUTCOME_MAP: Record<string, { outcomeName: string; success: boolean }> = {
  'inbound.received': { outcomeName: 'inbound.received', success: true },
  'payment.succeeded': { outcomeName: 'payment.succeeded', success: true },
  'checkout.abandoned': { outcomeName: 'checkout.abandoned', success: false },
  'coupon.redeemed': { outcomeName: 'coupon.redeemed', success: true },
  'conversation.handed_off': { outcomeName: 'conversation.handed_off', success: true },
  'contact.opted_out': { outcomeName: 'contact.opted_out', success: false },
  'payment.refunded': { outcomeName: 'payment.refunded', success: false },
  'subscription.canceled': { outcomeName: 'subscription.canceled', success: false },
  'inbound.silent_24h': { outcomeName: 'inbound.silent_24h', success: false },
};

const log = new WorkerLogger('decision-outcome-resolver');

export const decisionOutcomeWorker = new Worker(
  'decision-outcome',
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

      const data = job.data as {
        workspaceId: string;
        eventType: string;
        eventKey: string;
        outcomeKey?: string;
        correlation?: Record<string, unknown>;
      };

      if (job.name === 'resolve-event') {
        const mapping = OUTCOME_MAP[data.eventType];

        if (data.outcomeKey) {
          await prisma.decisionOutcome.updateMany({
            where: { outcomeKey: data.outcomeKey, outcomeAt: null },
            data: {
              outcomeAt: new Date(),
              outcomeName: mapping?.outcomeName ?? data.eventType,
              wonVsBaseline: mapping?.success ?? null,
            },
          });
          ctxLog.info('outcome_resolved', {
            outcomeKey: data.outcomeKey,
            eventType: data.eventType,
          });
        }

        await prisma.decisionOutcomeEvent.create({
          data: {
            workspaceId: data.workspaceId,
            eventType: data.eventType,
            eventKey: data.eventKey,
            ...(data.correlation
              ? { correlation: JSON.parse(JSON.stringify(data.correlation)) }
              : {}),
            processed: true,
            processedAt: new Date(),
          },
        });
      }

      if (job.name === 'sweep-expired') {
        const sweepData = job.data as unknown as { workspaceId: string; maxAgeHours?: number };
        const { workspaceId, maxAgeHours } = sweepData;
        const cutoff = new Date(Date.now() - (maxAgeHours ?? 48) * 3600 * 1000);

        const expired = await prisma.decisionOutcome.findMany({
          where: { workspaceId, outcomeAt: null, createdAt: { lt: cutoff } },
          select: { id: true },
        });

        if (expired.length > 0) {
          await prisma.decisionOutcome.updateMany({
            where: { id: { in: expired.map((e: { id: string }) => e.id) } },
            data: {
              outcomeAt: new Date(),
              outcomeName: 'inbound.silent_24h',
              wonVsBaseline: false,
            },
          });
          ctxLog.info('expired_outcomes_swept', { count: expired.length });
        }
      }

      await markCompleted(job);
      endJob(meta, ctxLog, job.name, 'completed');
      return { ok: true };
    } catch (err: unknown) {
      logError(meta, ctxLog, err, job.name);
      throw err;
    }
  },
  { ...buildQueueOptions(), concurrency: 2, lockDuration: 60000 },
);
