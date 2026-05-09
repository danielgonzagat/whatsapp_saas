import { type Job, Worker } from 'bullmq';
import { forEachSequential } from '../utils/async-sequence';
import { prisma } from '../db';
import { FlowEngineGlobal } from '../flow-engine-global';
import { WorkerLogger } from '../logger';
import { processCheckoutSocialLeadEnrichment } from './checkout-social-lead-enrichment';
import { PlanLimitsProvider } from '../providers/plan-limits';
import { buildQueueOptions } from '../queue';
import { isRetryableError, WorkerError } from '../src/utils/error-handler';
import { checkIdempotent, endJob, logError, markCompleted, startJob } from '../processor-base';

const log = new WorkerLogger('ghost-closer');
const engine = FlowEngineGlobal.get();

/** Ghost closer worker. */
export const ghostCloserWorker = new Worker(
  'crm-jobs',
  async (job: Job) => {
    const meta = startJob(job, log);
    const ctxLog = log.withContext(meta.correlationId, meta.workspaceId);

    try {
      const dedup = await checkIdempotent(job);
      if (dedup) {
        ctxLog.info('job_skipped_idempotent', { jobId: job.id });
        endJob(meta, ctxLog, job.name, 'skipped');
        return { ok: true, skipped: true, reason: 'idempotent' };
      }

      ctxLog.info('job_start', { jobId: job.id, name: job.name });
      await job.updateProgress(10);

      switch (job.name) {
        case 'check-inactivity':
          await checkInactivity(job.data.workspaceId);
          break;
        case 'checkout-social-lead-enrich':
          if (typeof job.data?.leadId === 'string' && job.data.leadId.trim()) {
            await processCheckoutSocialLeadEnrichment(job.data.leadId);
          }
          break;
        default:
          ctxLog.warn('unknown_job', { name: job.name });
      }

      await job.updateProgress(100);
      await markCompleted(job);
      endJob(meta, ctxLog, job.name, 'completed');
      return;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      logError(meta, ctxLog, err, job.name);

      if (!isRetryableError(err)) {
        throw new WorkerError(msg, 'CRM_PERMANENT', false);
      }

      throw err;
    }
  },
  { ...buildQueueOptions(), concurrency: 1, lockDuration: 120_000 },
);

async function checkInactivity(workspaceId: string) {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const limitCheck = await PlanLimitsProvider.checkMessageLimit(workspaceId);
  if (!limitCheck.allowed) {
    return;
  }

  const leads = await prisma.contact.findMany({
    where: {
      workspaceId,
      leadScore: { gte: 50 },
      conversations: {
        some: {
          status: 'OPEN',
          lastMessageAt: { lt: twoHoursAgo },
        },
      },
    },
    take: 50,
  });

  await forEachSequential(leads, async (lead) => {
    const hasNudged = (lead.customFields as Record<string, unknown> | null)?.last_nudge_at;
    if (hasNudged && new Date(String(hasNudged)) > twoHoursAgo) {
      return;
    }

    log.info('ghost_closer_trigger', { phone: lead.phone, workspaceId });

    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    const nudgeFlowId = (workspace?.providerSettings as Record<string, unknown> | null)
      ?.nudgeFlowId as string | undefined;

    if (nudgeFlowId) {
      const flow = await prisma.flow.findFirst({
        where: { id: nudgeFlowId, workspaceId },
      });
      if (flow) {
        await engine.startFlow(
          lead.phone,
          engine.parseFlowDefinition(
            flow.id,
            flow.nodes as Array<{
              id: string;
              type: string;
              data?: Record<string, unknown>;
            }>,
            flow.edges as Array<{
              source: string;
              target: string;
              sourceHandle?: string | null;
            }>,
            workspaceId,
          ),
        );

        await prisma.contact.updateMany({
          where: { id: lead.id, workspaceId },
          data: {
            customFields: {
              ...(lead.customFields as object),
              last_nudge_at: new Date().toISOString(),
            },
          },
        });
      }
    }
  });
}
