import { Worker, Job } from "bullmq";
import { connection, flowQueue } from "./queue";
import { prisma } from "./db";
import { WhatsAppEngine } from "./providers/whatsapp-engine";

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
    CAMPAIGN_JITTER_MIN_MS +
    (spread > 0 ? Math.floor(Math.random() * (spread + 1)) : 0);
  return previousDelay + jitter;
}

export const campaignWorker = new Worker(
  "campaign-jobs",
  async (job: Job) => {
    console.log(`\n🚀 [CAMPAIGN] Processing campaign ${job.data.campaignId}`);
    
    const { campaignId, workspaceId } = job.data;

    try {
      // 1. Fetch Campaign
      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
      });

      if (!campaign) {
        console.error(`❌ Campaign ${campaignId} not found`);
        return;
      }

      // Ensure campaign belongs to workspace
      if (campaign.workspaceId !== workspaceId) {
        console.error(`❌ Campaign ${campaignId} does not belong to workspace ${workspaceId}`);
        return;
      }

      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: "RUNNING" },
      });

      // 2. Fetch Audience (supports tags and explicit phones)
      const filters = campaign.filters as any;
      const where: any = { workspaceId };
      if (filters?.tags && filters.tags.length > 0) {
        where.tags = {
          some: { name: { in: filters.tags } },
        };
      }
      if (filters?.phones && Array.isArray(filters.phones) && filters.phones.length > 0) {
        where.phone = { in: filters.phones };
      }

      const contacts = await prisma.contact.findMany({
        where,
        select: { phone: true, name: true, id: true, customFields: true },
      });

      console.log(`👥 Audience size: ${contacts.length}`);

      // 3. Dispatch
      const template = campaign.messageTemplate || "";
      const isUuid =
        template.length === 36 &&
        template.split("-").length === 5;
      const isFlowId = template.startsWith("flow:") || isUuid;
      let sentCount = 0;

      if (isFlowId) {
        // Use FlowEngine
        let cumulativeDelay = 0;
        const jobs = contacts
          .filter((c) => !!c.phone)
          .map((contact) => {
            cumulativeDelay = scheduleDelay(cumulativeDelay);

            return {
              name: "run-flow",
              data: {
                flowId: template.startsWith("flow:") ? template.replace("flow:", "") : template,
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
                backoff: { type: "exponential", delay: 5000 },
                delay: cumulativeDelay,
              },
            };
          });
        await flowQueue.addBulk(jobs);
        sentCount = contacts.length;

        // Atribuição básica: marcar último campaignId no contato
        for (const contact of contacts) {
          if (!contact.id) continue;
          const cf: any = contact.customFields || {};
          await prisma.contact.update({
            where: { id: contact.id },
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
              name: "send-message",
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
                backoff: { type: "exponential", delay: 5000 },
                delay: cumulativeDelay,
              },
            };
          });

        await flowQueue.addBulk(jobs);
        sentCount = contacts.length;

        for (const contact of contacts) {
          if (!contact.id) continue;
          const cf: any = contact.customFields || {};
          await prisma.contact.update({
            where: { id: contact.id },
            data: { customFields: { ...cf, lastCampaignId: campaignId } },
          });
        }
      }

      // 4. Update Stats / Finish
      await prisma.campaign.update({
        where: { id: campaignId },
        data: {
          status: "COMPLETED",
          stats: {
            ...((campaign.stats as object) || {}),
            sent: sentCount,
          },
        },
      });

      console.log(`✅ Campaign ${campaignId} dispatched successfully (${sentCount} sent)`);

    } catch (err) {
      console.error(`❌ Campaign ${campaignId} failed:`, err);
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: "CANCELLED" as any },
      });
      throw err;
    }
  },
  {
    connection,
    concurrency: 5, // Process 5 campaigns in parallel
    lockDuration: 60000,
  }
);
