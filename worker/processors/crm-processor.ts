import { type Job, Worker } from 'bullmq';
import { prisma } from '../db';
import { FlowEngineGlobal } from '../flow-engine-global';
import { WorkerLogger } from '../logger';
import { processCheckoutSocialLeadEnrichment } from './checkout-social-lead-enrichment';
import { PlanLimitsProvider } from '../providers/plan-limits';
import { connection } from '../queue';

const log = new WorkerLogger('ghost-closer');
const engine = FlowEngineGlobal.get();

export const ghostCloserWorker = new Worker(
  'crm-jobs',
  async (job: Job) => {
    log.info('job_start', { jobId: job.id, name: job.name });
    try {
      switch (job.name) {
        // PULSE:OK — check-inactivity is scheduled via repeatable jobs or cron; no direct queue.add call
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
    } catch (err: unknown) {
      log.error('job_failed', {
        jobId: job.id,
        error: err instanceof Error ? err.message : 'unknown error',
      });
      throw err;
    }
  },
  { connection, concurrency: 1 }, // Single concurrency to avoid race conditions
);

async function checkInactivity(workspaceId: string) {
  // 1. Find leads that match criteria:
  // - High Score (> 50)
  // - No message in last 2 hours
  // - Status OPEN
  // - Not already in a flow? (optional check)

  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const limitCheck = await PlanLimitsProvider.checkMessageLimit(workspaceId);
  if (!limitCheck.allowed) return;

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

  // biome-ignore lint/performance/noAwaitInLoops: sequential lead processing
  for (const lead of leads) {
    // Check if we already nudged recently (custom field or tag)
    const hasNudged = (lead.customFields as any)?.last_nudge_at;
    if (hasNudged && new Date(hasNudged) > twoHoursAgo) continue;

    log.info('ghost_closer_trigger', { phone: lead.phone });

    // Trigger Nudge Flow
    // Ideally, we should have a configured "Nudge Flow ID" in workspace settings
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    const nudgeFlowId = (workspace?.providerSettings as any)?.nudgeFlowId;

    if (nudgeFlowId) {
      const flow = await prisma.flow.findFirst({
        where: { id: nudgeFlowId, workspaceId },
      });
      if (flow) {
        // Start flow
        await engine.startFlow(
          lead.phone,
          engine.parseFlowDefinition(flow.id, flow.nodes as any, flow.edges as any, workspaceId),
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
  }
}
