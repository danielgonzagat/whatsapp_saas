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

function extractChannel(contextSnapshot: unknown): string | undefined {
  if (
    contextSnapshot &&
    typeof contextSnapshot === 'object' &&
    !Array.isArray(contextSnapshot)
  ) {
    const ctx = contextSnapshot as Record<string, unknown>;
    const channel = ctx.channel;
    return typeof channel === 'string' ? channel : undefined;
  }
  return undefined;
}

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
        const wonVsBaseline = mapping?.success ?? false;

        if (data.outcomeKey) {
          const openRows = await prisma.decisionOutcome.findMany({
            where: { outcomeKey: data.outcomeKey, outcomeAt: null },
            select: { id: true, contextSnapshot: true, decisionType: true, chosenAction: true },
          });

          const updateResult = await prisma.decisionOutcome.updateMany({
            where: { outcomeKey: data.outcomeKey, outcomeAt: null },
            data: {
              outcomeAt: new Date(),
              outcomeName: mapping?.outcomeName ?? data.eventType,
              wonVsBaseline: mapping?.success ?? null,
            },
          });

          if (updateResult.count > 0) {
            for (const row of openRows) {
              const gChannel = extractChannel(row.contextSnapshot);
              if (gChannel) {
                try {
                  await prisma.kloelGlobalPrior.upsert({
                    where: {
                      channel_decisionType_action: {
                        channel: gChannel,
                        decisionType: row.decisionType,
                        action: row.chosenAction,
                      },
                    },
                    create: {
                      channel: gChannel,
                      decisionType: row.decisionType,
                      action: row.chosenAction,
                      observations: 1,
                      successes: wonVsBaseline ? 1 : 0,
                    },
                    update: {
                      observations: { increment: 1 },
                      ...(wonVsBaseline ? { successes: { increment: 1 } } : {}),
                    },
                  });
                } catch (err: unknown) {
                  ctxLog.warn('global_prior_upsert_failed', {
                    outcomeKey: data.outcomeKey,
                    channel: gChannel,
                    decisionType: row.decisionType,
                    chosenAction: row.chosenAction,
                    error: err instanceof Error ? err.message : String(err),
                  });
                }
              }
            }
          }

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
          select: { id: true, contextSnapshot: true, decisionType: true, chosenAction: true },
        });

        if (expired.length > 0) {
          await prisma.decisionOutcome.updateMany({
            where: { id: { in: expired.map((e) => e.id) } },
            data: {
              outcomeAt: new Date(),
              outcomeName: 'inbound.silent_24h',
              wonVsBaseline: false,
            },
          });

          for (const row of expired) {
            const gChannel = extractChannel(row.contextSnapshot);
            if (gChannel) {
              try {
                await prisma.kloelGlobalPrior.upsert({
                  where: {
                    channel_decisionType_action: {
                      channel: gChannel,
                      decisionType: row.decisionType,
                      action: row.chosenAction,
                    },
                  },
                  create: {
                    channel: gChannel,
                    decisionType: row.decisionType,
                    action: row.chosenAction,
                    observations: 1,
                    successes: 0,
                  },
                  update: {
                    observations: { increment: 1 },
                  },
                });
              } catch (err: unknown) {
                ctxLog.warn('global_prior_upsert_failed_on_sweep', {
                  channel: gChannel,
                  decisionType: row.decisionType,
                  chosenAction: row.chosenAction,
                  error: err instanceof Error ? err.message : String(err),
                });
              }
            }
          }

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
