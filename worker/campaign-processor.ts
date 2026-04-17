import { type Job, Worker } from 'bullmq';
import { prisma } from './db';
import { connection, flowQueue } from './queue';

/**
 * =======================================================
 * CAMPAIGN ENGINE — MASS DISPATCHER
 * =======================================================
 */

const CAMPAIGN_JITTER_MIN_MS = Math.max(
  0,
  Number(process.env.CAMPAIGN_JITTER_MIN_MS || 5000) || 5000,
);
const CAMPAIGN_JITTER_MAX_MS = Math.max(
  CAMPAIGN_JITTER_MIN_MS,
  Number(process.env.CAMPAIGN_JITTER_MAX_MS || 15000) || 15000,
);

function scheduleDelay(previousDelay: number): number {
  const spread = CAMPAIGN_JITTER_MAX_MS - CAMPAIGN_JITTER_MIN_MS;
  const jitter =
    CAMPAIGN_JITTER_MIN_MS + (spread > 0 ? Math.floor(Math.random() * (spread + 1)) : 0);
  return previousDelay + jitter;
}

export const campaignWorker = new Worker(
  'campaign-jobs',
  async (job: Job) => {
    console.log(`\n🚀 [CAMPAIGN] Processing campaign ${job.data.campaignId}`);

    const { campaignId, workspaceId } = job.data;

    try {
      // 1. Fetch Campaign
      const campaign = await prisma.campaign.findFirst({
        where: { id: campaignId, workspaceId },
      });

      if (!campaign) {
        console.error(`❌ Campaign ${campaignId} not found`);
        return;
      }

      await prisma.campaign.updateMany({
        where: { id: campaignId, workspaceId },
        data: { status: 'RUNNING' },
      });

      // 2. Fetch Audience (supports tags and explicit phones)
      const filters = (campaign.filters || {}) as Record<string, unknown>;
      const where: {
        workspaceId: string;
        tags?: { some: { name: { in: string[] } } };
        phone?: { in: string[] };
      } = { workspaceId };
      if (Array.isArray(filters?.tags) && filters.tags.length > 0) {
        where.tags = {
          some: { name: { in: filters.tags as string[] } },
        };
      }
      if (Array.isArray(filters?.phones) && filters.phones.length > 0) {
        where.phone = { in: filters.phones as string[] };
      }

      const contacts = await prisma.contact.findMany({
        where,
        select: { phone: true, name: true, id: true, customFields: true },
      });

      console.log(`👥 Audience size: ${contacts.length}`);

      // 3. Dispatch
      const template = campaign.messageTemplate || '';
      const isUuid = template.length === 36 && template.split('-').length === 5;
      const isFlowId = template.startsWith('flow:') || isUuid;
      let sentCount = 0;

      if (isFlowId) {
        // Use FlowEngine
        let cumulativeDelay = 0;
        const jobs = contacts
          .filter((c) => !!c.phone)
          .map((contact) => {
            cumulativeDelay = scheduleDelay(cumulativeDelay);

            return {
              name: 'run-flow',
              data: {
                flowId: template.startsWith('flow:') ? template.replace('flow:', '') : template,
                user: contact.phone,
                workspaceId,
                initialVars: {
                  contact_name: contact.name,
                  campaign_id: campaignId,
                },
              },
              opts: {
                removeOnComplete: true,
                attempts: 3,
                backoff: { type: 'exponential', delay: 5000 },
                delay: cumulativeDelay,
              },
            };
          });
        await flowQueue.addBulk(jobs);
        sentCount = contacts.length;

        // Atribuição básica: marcar último campaignId no contato
        // biome-ignore lint/performance/noAwaitInLoops: sequential per-contact processing
        for (const contact of contacts) {
          if (!contact.id) continue;
          const cf = (contact.customFields || {}) as Record<string, unknown>;
          await prisma.contact.updateMany({
            where: { id: contact.id, workspaceId },
            data: { customFields: { ...cf, lastCampaignId: campaignId } },
          });
        }
      } else {
        // Direct send via worker (anti-ban + provider routing)
        let cumulativeDelay = 0;
        const jobs = contacts
          .filter((c) => !!c.phone)
          .map((contact) => {
            cumulativeDelay = scheduleDelay(cumulativeDelay);

            return {
              name: 'send-message',
              data: {
                workspaceId,
                workspace: null,
                to: contact.phone,
                user: contact.phone,
                message: template,
              },
              opts: {
                removeOnComplete: true,
                attempts: 3,
                backoff: { type: 'exponential', delay: 5000 },
                delay: cumulativeDelay,
              },
            };
          });

        await flowQueue.addBulk(jobs);
        sentCount = contacts.length;

        // biome-ignore lint/performance/noAwaitInLoops: sequential per-contact processing
        for (const contact of contacts) {
          if (!contact.id) continue;
          const cf = (contact.customFields || {}) as Record<string, unknown>;
          await prisma.contact.updateMany({
            where: { id: contact.id, workspaceId },
            data: { customFields: { ...cf, lastCampaignId: campaignId } },
          });
        }
      }

      // 4. Update Stats / Finish
      await prisma.campaign.updateMany({
        where: { id: campaignId, workspaceId },
        data: {
          status: 'COMPLETED',
          stats: {
            ...((campaign.stats as object) || {}),
            sent: sentCount,
          },
        },
      });

      console.log(`✅ Campaign ${campaignId} dispatched successfully (${sentCount} sent)`);
    } catch (err) {
      console.error(`❌ Campaign ${campaignId} failed:`, err);
      await prisma.campaign.updateMany({
        where: { id: campaignId, workspaceId },
        data: { status: 'CANCELLED' },
      });
      throw err;
    }
  },
  {
    connection,
    concurrency: 5, // Process 5 campaigns in parallel
    lockDuration: 60000,
  },
);
