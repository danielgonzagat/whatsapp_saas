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

      // Cap the batch — unbounded findMany can OOM after extended downtime
      // when thousands of outcomes accumulate. 500 per 5-min tick = 6000/h,
      // enough to drain any realistic backlog in a couple of hours.
      const BATCH_CAP = 500;
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
        orderBy: { createdAt: 'asc' },
        take: BATCH_CAP,
      });

      if (openOutcomes.length === BATCH_CAP) {
        ctxLog.warn('silent_24h_batch_cap_hit', {
          batchCap: BATCH_CAP,
          hint: 'Backlog larger than 500 — next ticks will drain remainder',
        });
      }

      const pastWindow = openOutcomes.filter((d) => {
        const deadline = new Date(d.createdAt.getTime() + d.expectedWindow * 3600 * 1000);
        return deadline < now;
      });

      let replied = 0;
      let silent = 0;

      for (const decision of pastWindow) {
        const contactId = extractContactId(decision.contextSnapshot);
        // Note: decisionOutcomeEvent table is currently unwired — no service emits
        // 'inbound.received' yet (see DecisionOutcomeService.recordEvent: no callers).
        // Until wired, this query returns null for every decision and all expired
        // outcomes close as silent_24h. This is fail-safe (no false 'replied' wins),
        // but loses real-reply attribution. The contactId filter via correlation
        // JSON path is included now so resolution is correct once events are wired.
        const replyEvent = contactId
          ? await prisma.decisionOutcomeEvent.findFirst({
              where: {
                workspaceId: decision.workspaceId,
                eventType: 'inbound.received',
                createdAt: { gt: decision.createdAt },
                correlation: { path: ['contactId'], equals: contactId },
              },
              select: { id: true },
            })
          : null;

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

        const gChannel = extractChannel(decision.contextSnapshot);
        if (gChannel) {
          try {
            await prisma.kloelGlobalPrior.upsert({
              where: {
                channel_decisionType_action: {
                  channel: gChannel,
                  decisionType: decision.decisionType,
                  action: decision.chosenAction,
                },
              },
              create: {
                channel: gChannel,
                decisionType: decision.decisionType,
                action: decision.chosenAction,
                observations: 1,
                successes: updateData.wonVsBaseline ? 1 : 0,
              },
              update: {
                observations: { increment: 1 },
                ...(updateData.wonVsBaseline ? { successes: { increment: 1 } } : {}),
              },
            });
          } catch (err: unknown) {
            ctxLog.warn('global_prior_upsert_failed', {
              outcomeKey: decision.outcomeKey,
              channel: gChannel,
              decisionType: decision.decisionType,
              chosenAction: decision.chosenAction,
              error: err instanceof Error ? err.message : String(err),
            });
          }
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
          replied += 1;
          ctxLog.info('outcome_resolved_replied', { outcomeKey: decision.outcomeKey });
        } else {
          silent += 1;
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
