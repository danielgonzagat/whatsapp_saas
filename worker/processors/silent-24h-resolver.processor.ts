import { type Job, Worker } from 'bullmq';
import { prisma } from '../db';
import { WorkerLogger } from '../logger';
import { buildQueueOptions } from '../queue';
import { checkIdempotent, endJob, logError, markCompleted, startJob } from '../processor-base';

const log = new WorkerLogger('silent-24h-resolver');

function extractContactId(contextSnapshot: unknown): string | undefined {
  if (
    contextSnapshot &&
    typeof contextSnapshot === 'object' &&
    !Array.isArray(contextSnapshot)
  ) {
    const ctx = contextSnapshot as Record<string, unknown>;
    const id = ctx.contactId ?? ctx.contact_id ?? ctx.userId ?? ctx.phone;
    return typeof id === 'string' ? id : undefined;
  }
  return undefined;
}

export const silent24hResolverWorker = new Worker(
  'silent-24h-resolver',
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

      const now = new Date();

      const openOutcomes = await prisma.decisionOutcome.findMany({
        where: { outcomeAt: null },
        select: {
          id: true,
          workspaceId: true,
          outcomeKey: true,
          decisionType: true,
          chosenAction: true,
          baselineAction: true,
          expectedWindow: true,
          contextSnapshot: true,
          createdAt: true,
        },
      });

      const pastWindow = openOutcomes.filter((d) => {
        const deadline = new Date(d.createdAt.getTime() + d.expectedWindow * 3600 * 1000);
        return deadline < now;
      });

      let replied = 0;
      let silent = 0;

      for (const decision of pastWindow) {
        const replyEvent = await prisma.decisionOutcomeEvent.findFirst({
          where: {
            workspaceId: decision.workspaceId,
            eventType: 'inbound.received',
            createdAt: { gt: decision.createdAt },
          },
          select: { id: true },
        });

        const contactId = extractContactId(decision.contextSnapshot);
        const metaPayload = {
          outcomeKey: decision.outcomeKey,
          decisionType: decision.decisionType,
          ...(contactId ? { contactId } : {}),
        };

        const resolution = replyEvent ? 'replied' : 'silent_24h';
        const updateData = replyEvent
          ? { outcomeAt: now, outcomeName: 'inbound.received' as const, wonVsBaseline: true }
          : {
              outcomeAt: now,
              outcomeName: 'inbound.silent_24h' as const,
              economicValue: 0,
              wonVsBaseline: false,
            };

        // Atomic claim — only the worker that flips outcomeAt: null -> now wins.
        // Subsequent autopilotEvent.create runs only on win, avoiding duplicate
        // outcome.silent_24h_closed events when concurrency > 1.
        const claim = await prisma.decisionOutcome.updateMany({
          where: { id: decision.id, outcomeAt: null },
          data: updateData,
        });

        if (claim.count === 0) {
          ctxLog.info('outcome_claim_lost_to_concurrent_worker', {
            outcomeKey: decision.outcomeKey,
          });
          continue;
        }

        await prisma.autopilotEvent.create({
          data: {
            workspaceId: decision.workspaceId,
            contactId: contactId ?? null,
            intent: 'outcome.silent_24h_closed',
            action: 'outcome.silent_24h_closed',
            status: 'executed',
            reason: resolution,
            meta: { ...metaPayload, resolution },
          },
        });

        if (replyEvent) {
          replied++;
          ctxLog.info('outcome_resolved_replied', { outcomeKey: decision.outcomeKey });
        } else {
          silent++;
          ctxLog.info('outcome_resolved_silent_24h', { outcomeKey: decision.outcomeKey });
        }
      }

      await markCompleted(job);
      const durationMs = endJob(meta, ctxLog, job.name, 'completed');
      return { ok: true, replied, silent, durationMs };
    } catch (err: unknown) {
      logError(meta, ctxLog, err, job.name);
      throw err;
    }
  },
  { ...buildQueueOptions(), concurrency: 2, lockDuration: 120_000 },
);
