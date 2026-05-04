import { type Job, Worker } from 'bullmq';
import { forEachSequential } from '../utils/async-sequence';
import { prisma } from '../db';
import { FlowEngineGlobal } from '../flow-engine-global';
import { WorkerLogger } from '../logger';
import { processCheckoutSocialLeadEnrichment } from './checkout-social-lead-enrichment';
import { PlanLimitsProvider } from '../providers/plan-limits';
import { connection } from '../queue';
import { isRetryableError, WorkerError } from '../src/utils/error-handler';

const log = new WorkerLogger('ghost-closer');
const engine = FlowEngineGlobal.get();

/** Ghost closer worker. */
export const ghostCloserWorker = new Worker(
  'crm-jobs',
  async (job: Job) => {
    log.info('job_start', { jobId: job.id, name: job.name });
    try {
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
          log.warn('unknown_job', { name: job.name });
      }
      await job.updateProgress(100);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      log.error('job_failed', {
        jobId: job.id,
        error: msg,
      });

      if (!isRetryableError(err)) {
        throw new WorkerError(msg, 'CRM_PERMANENT', false);
      }

      throw err;
    }
  },
  { connection, concurrency: 1, lockDuration: 120_000 },
);

async function checkInactivity(workspaceId: string) {
  // 1. Find leads that match criteria:
  // - High Score (> 50)
  // - No message in last 2 hours
  // - Status OPEN
  // - Not already in a flow? (optional check)

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
    take: 50, // Batch process
  });

  await forEachSequential(leads, async (lead) => {
    // Check if we already nudged recently (custom field or tag)
    const hasNudged = (lead.customFields as Record<string, unknown> | null)?.last_nudge_at;
    if (hasNudged && new Date(String(hasNudged)) > twoHoursAgo) {
      return;
    }

    log.info('ghost_closer_trigger', { phone: lead.phone });

    // Trigger Nudge Flow
    // Ideally, we should have a configured "Nudge Flow ID" in workspace settings
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    const nudgeFlowId = (workspace?.providerSettings as Record<string, unknown> | null)
      ?.nudgeFlowId as string | undefined;

    if (nudgeFlowId) {
      const flow = await prisma.flow.findFirst({
        where: { id: nudgeFlowId, workspaceId },
      });
      if (flow) {
        // Start flow
        await engine.startFlow(
          lead.phone,
          engine.parseFlowDefinition(
            flow.id,
            flow.nodes as unknown as Array<{
              id: string;
              type: string;
              data?: Record<string, unknown>;
            }>,
            flow.edges as unknown as Array<{
              source: string;
              target: string;
              sourceHandle?: string | null;
            }>,
            workspaceId,
          ),
        );

        // Update last nudge scoped by workspace so no accidental tenant cross.
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
