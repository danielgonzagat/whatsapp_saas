import { randomInt } from 'node:crypto';
import { type Job, Worker } from 'bullmq';
import { prisma } from './db';
import { buildQueueOptions, flowQueue } from './queue';
import { isRetryableError, WorkerError } from './src/utils/error-handler';
import { forEachSequential } from './utils/async-sequence';
import { WorkerLogger } from './logger';
import { checkIdempotent, endJob, logError, markCompleted, startJob } from './processor-base';

/**
 * =======================================================
 * CAMPAIGN ENGINE — MASS DISPATCHER
 * =======================================================
 */

const log = new WorkerLogger('campaign-worker');

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
  const jitter = CAMPAIGN_JITTER_MIN_MS + (spread > 0 ? randomInt(spread + 1) : 0);
  return previousDelay + jitter;
}

type CampaignContact = {
  id: string | null;
  phone: string | null;
  name: string | null;
  customFields: unknown;
};

type CampaignAudienceWhere = {
  workspaceId: string;
  tags?: { some: { name: { in: string[] } } };
  phone?: { in: string[] };
};

function buildAudienceWhere(
  workspaceId: string,
  filters: Record<string, unknown>,
): CampaignAudienceWhere {
  const where: CampaignAudienceWhere = { workspaceId };
  if (Array.isArray(filters?.tags) && filters.tags.length > 0) {
    where.tags = { some: { name: { in: filters.tags as string[] } } };
  }
  if (Array.isArray(filters?.phones) && filters.phones.length > 0) {
    where.phone = { in: filters.phones as string[] };
  }
  return where;
}

function isFlowTemplate(template: string): boolean {
  const isUuid = template.length === 36 && template.split('-').length === 5;
  return template.startsWith('flow:') || isUuid;
}

function resolveFlowId(template: string): string {
  return template.startsWith('flow:') ? template.replace('flow:', '') : template;
}

function buildFlowJobs(
  contacts: CampaignContact[],
  template: string,
  workspaceId: string,
  campaignId: string,
) {
  let cumulativeDelay = 0;
  return contacts
    .filter((c) => !!c.phone)
    .map((contact) => {
      cumulativeDelay = scheduleDelay(cumulativeDelay);
      return {
        name: 'run-flow',
        data: {
          flowId: resolveFlowId(template),
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
}

function buildDirectSendJobs(contacts: CampaignContact[], template: string, workspaceId: string) {
  let cumulativeDelay = 0;
  return contacts
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
}

async function attributeCampaignToContacts(
  contacts: CampaignContact[],
  workspaceId: string,
  campaignId: string,
): Promise<void> {
  await forEachSequential(contacts, async (contact) => {
    if (!contact.id) {
      return;
    }
    const cf = (contact.customFields || {}) as Record<string, unknown>;
    await prisma.contact.updateMany({
      where: { id: contact.id, workspaceId },
      data: { customFields: { ...cf, lastCampaignId: campaignId } },
    });
  });
}

/** Campaign worker. */
export const campaignWorker = new Worker(
  'campaign-jobs',
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

      const { campaignId, workspaceId } = job.data;

      ctxLog.info('campaign_processing', { campaignId, workspaceId });

      const campaign = await prisma.campaign.findFirst({
        where: { id: campaignId, workspaceId },
      });

      if (!campaign) {
        throw new WorkerError(`Campaign ${campaignId} not found`, 'CAMPAIGN_NOT_FOUND', false);
      }

      await job.updateProgress(5);

      await prisma.campaign.updateMany({
        where: { id: campaignId, workspaceId },
        data: { status: 'RUNNING' },
      });

      const filters = (campaign.filters || {}) as Record<string, unknown>;
      const where = buildAudienceWhere(workspaceId, filters);

      const contacts = await prisma.contact.findMany({
        where: { workspaceId, ...where },
        select: { phone: true, name: true, id: true, customFields: true },
      });

      await job.updateProgress(20);
      ctxLog.info('campaign_audience', { campaignId, size: contacts.length });

      const template = campaign.messageTemplate || '';
      let sentCount = 0;

      if (isFlowTemplate(template)) {
        const jobs = buildFlowJobs(contacts, template, workspaceId, campaignId);
        await job.updateProgress(50);
        await flowQueue.addBulk(jobs);
        sentCount = contacts.length;
        await attributeCampaignToContacts(contacts, workspaceId, campaignId);
      } else {
        const jobs = buildDirectSendJobs(contacts, template, workspaceId);
        await job.updateProgress(50);
        await flowQueue.addBulk(jobs);
        sentCount = contacts.length;
        await attributeCampaignToContacts(contacts, workspaceId, campaignId);
      }

      await job.updateProgress(90);

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

      await job.updateProgress(100);
      await markCompleted(job);
      endJob(meta, ctxLog, job.name, 'completed');
      ctxLog.info('campaign_dispatched', { campaignId, sentCount });
      return;
    } catch (err) {
      logError(meta, ctxLog, err, job.name);
      const campaignId = job.data?.campaignId;
      const workspaceId = job.data?.workspaceId;
      if (campaignId && workspaceId) {
        await prisma.campaign
          .updateMany({
            where: { id: campaignId, workspaceId },
            data: { status: 'CANCELLED' },
          })
          .catch(() => {});
      }

      if (!isRetryableError(err)) {
        throw new WorkerError(
          err instanceof Error ? err.message : String(err),
          'CAMPAIGN_PERMANENT',
          false,
        );
      }

      throw err;
    }
  },
  { ...buildQueueOptions(), concurrency: 5, lockDuration: 60000 },
);
