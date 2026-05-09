import { type Job, Worker } from 'bullmq';
import type { Prisma } from '@prisma/client';
import { prisma } from './db';
import { buildQueueOptions } from './queue';
import { isRetryableError, WorkerError } from './src/utils/error-handler';
import { triggerFlowForScrapedLeads } from './scrapers/auto-trigger';
import { scrapeGoogleMaps } from './scrapers/google-maps';
import { forEachSequential } from './utils/async-sequence';
import { WorkerLogger } from './logger';
import { checkIdempotent, endJob, logError, markCompleted, startJob } from './processor-base';

/**
 * =======================================================
 * SCRAPER ENGINE — GOOGLE MAPS & INSTAGRAM
 * =======================================================
 *
 * Uses Puppeteer (Real Browser) for Maps.
 * Uses Mocks for Instagram (Temporary).
 */

const log = new WorkerLogger('scraper-worker');

interface ScrapedLeadNormalized {
  phone: string;
  name: string;
  category: string;
  address: string;
  metadata: Prisma.InputJsonObject;
}

async function scrapeLeadsByType(type: string, query: string): Promise<ScrapedLeadNormalized[]> {
  if (type === 'MAPS') {
    const rawLeads = await scrapeGoogleMaps(query, 20);
    return rawLeads.map((l) => ({
      phone: l.phone || '',
      name: l.name,
      category: l.category,
      address: l.address,
      metadata: { source: 'Google Maps', raw: { ...l } },
    }));
  }
  if (type === 'INSTAGRAM') {
    const { scrapeInstagram } = await import('./scrapers/instagram');
    const rawLeads = await scrapeInstagram(query, 5);
    return rawLeads.map((l) => ({
      phone: l.phone || '',
      name: l.name,
      category: l.category,
      address: l.address,
      metadata: { source: 'Instagram', ...l.metadata },
    }));
  }
  if (type === 'GROUP') {
    throw new WorkerError(
      'WhatsApp Group scraping is not yet implemented.',
      'SCRAPER_NOT_IMPLEMENTED',
      false,
    );
  }
  throw new WorkerError(`Unknown scraper type: ${type}`, 'SCRAPER_INVALID_TYPE', false);
}

async function ensureDefaultPipeline(workspaceId: string) {
  const existing = await prisma.pipeline.findFirst({ where: { workspaceId } });
  if (existing) {
    return existing;
  }
  return prisma.pipeline.create({
    data: { name: 'Funil de Vendas', workspaceId },
  });
}

async function ensureFirstStage(pipelineId: string) {
  const existing = await prisma.stage.findFirst({
    where: { pipelineId },
    orderBy: { order: 'asc' },
  });
  if (existing) {
    return existing;
  }
  return prisma.stage.create({
    data: { name: 'Lead', order: 1, color: '#3b82f6', pipelineId },
  });
}

async function persistLeadWithCrm(
  lead: ScrapedLeadNormalized,
  context: { jobId: string; workspaceId: string; firstStageId: string | null },
): Promise<string> {
  const scraped = await prisma.scrapedLead.create({
    data: {
      jobId: context.jobId,
      phone: lead.phone || 'N/A',
      name: lead.name,
      category: lead.category,
      address: lead.address || '',
      metadata: lead.metadata || {},
      isValid: !!lead.phone,
    },
  });

  const contactCustomFields = (scraped.metadata as Prisma.InputJsonValue) || {};
  const contact = await prisma.contact.upsert({
    where: { workspaceId_phone: { workspaceId: context.workspaceId, phone: scraped.phone } },
    update: { name: scraped.name, customFields: contactCustomFields },
    create: {
      workspaceId: context.workspaceId,
      phone: scraped.phone,
      name: scraped.name,
      customFields: contactCustomFields,
    },
  });

  if (context.firstStageId) {
    await prisma.deal.create({
      data: {
        title: scraped.name || 'Lead',
        value: 0,
        status: 'OPEN',
        contactId: contact.id,
        stageId: context.firstStageId,
      },
    });
  }

  return contact.id;
}

/** Scraper worker. */
export const scraperWorker = new Worker(
  'scraper-jobs',
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

      const { jobId, query, type, workspaceId } = job.data;
      ctxLog.info('scraper_job_start', { jobId, type, query });

      await job.updateProgress(5);
      await prisma.scrapingJob.update({
        where: { id: jobId, workspaceId },
        data: { stats: { status: 'running', found: 0, valid: 0, imported: 0 } },
      });

      await job.updateProgress(20);
      const leads = await scrapeLeadsByType(type, query);

      await job.updateProgress(40);
      const pipeline = await ensureDefaultPipeline(workspaceId);
      const stage = await ensureFirstStage(pipeline.id);
      const firstStageId = stage.id;

      const importedContacts: string[] = [];
      let savedCount = 0;
      await job.updateProgress(50);
      await forEachSequential(leads, async (lead, index) => {
        const contactId = await persistLeadWithCrm(lead, { jobId, workspaceId, firstStageId });
        importedContacts.push(contactId);
        savedCount++;
        if (leads.length > 0 && index % Math.max(1, Math.floor(leads.length / 10)) === 0) {
          await job.updateProgress(50 + Math.floor((40 * (index + 1)) / leads.length));
        }
      });

      await job.updateProgress(95);

      await prisma.scrapingJob.update({
        where: { id: jobId, workspaceId },
        data: {
          stats: {
            status: 'completed',
            found: leads.length,
            valid: savedCount,
            imported: importedContacts.length,
          },
        },
      });

      await triggerFlowForScrapedLeads(workspaceId, importedContacts);

      await job.updateProgress(100);
      await markCompleted(job);
      endJob(meta, ctxLog, job.name, 'completed');
      ctxLog.info('scraper_job_complete', { jobId, savedCount });
      return;
    } catch (err) {
      logError(meta, ctxLog, err, job.name);
      const { jobId, workspaceId } = job.data || {};
      if (jobId && workspaceId) {
        await prisma.scrapingJob
          .update({
            where: { id: jobId, workspaceId },
            data: {
              stats: {
                status: 'failed',
                error: err instanceof Error ? err.message : String(err),
              },
            },
          })
          .catch(() => {});
      }

      if (!isRetryableError(err)) {
        throw new WorkerError(
          err instanceof Error ? err.message : String(err),
          'SCRAPER_PERMANENT',
          false,
        );
      }

      throw err;
    }
  },
  {
    ...buildQueueOptions(),
    concurrency: 1,
    lockDuration: 300_000,
    limiter: { max: 5, duration: 1000 },
  },
);
