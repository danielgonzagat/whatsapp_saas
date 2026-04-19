import { type Job, Worker } from 'bullmq';
import type { Prisma } from '@prisma/client';
import { prisma } from './db';
import { connection } from './queue';
import { triggerFlowForScrapedLeads } from './scrapers/auto-trigger';
import { scrapeGoogleMaps } from './scrapers/google-maps';
import { forEachSequential } from './utils/async-sequence';

/**
 * =======================================================
 * SCRAPER ENGINE — GOOGLE MAPS & INSTAGRAM
 * =======================================================
 *
 * Uses Puppeteer (Real Browser) for Maps.
 * Uses Mocks for Instagram (Temporary).
 */

interface ScrapedLeadNormalized {
  phone: string;
  name: string;
  category: string;
  address: string;
  metadata: Prisma.InputJsonObject;
}

async function scrapeLeadsByType(
  type: string,
  query: string,
  targetUrl: string | undefined,
): Promise<ScrapedLeadNormalized[]> {
  if (type === 'MAPS') {
    console.log(`[SCRAPER] Launching Real Browser for Maps query: "${query}"`);
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
    console.log(`[SCRAPER] Launching Real Browser for Instagram query: "${query}"`);
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
    console.log(`[SCRAPER] Group scraping not yet implemented for: "${query || targetUrl}"`);
    return [];
  }
  return [];
}

async function ensureDefaultPipeline(workspaceId: string) {
  const existing = await prisma.pipeline.findFirst({ where: { workspaceId } });
  if (existing) return existing;
  return prisma.pipeline.create({
    data: { name: 'Funil de Vendas', workspaceId },
  });
}

async function ensureFirstStage(pipelineId: string) {
  const existing = await prisma.stage.findFirst({
    where: { pipelineId },
    orderBy: { order: 'asc' },
  });
  if (existing) return existing;
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

async function processScraperJob(job: Job): Promise<void> {
  console.log(`\n🕷️ [SCRAPER] Starting job ${job.id} (${job.data.type})`);
  const { jobId, query, type, workspaceId } = job.data;

  try {
    await prisma.scrapingJob.update({ where: { id: jobId }, data: {} });

    const leads = await scrapeLeadsByType(type, query, job.data.targetUrl);

    const pipeline = await ensureDefaultPipeline(workspaceId);
    const stage = await ensureFirstStage(pipeline.id);
    const firstStageId = stage.id;

    const importedContacts: string[] = [];
    let savedCount = 0;
    await forEachSequential(leads, async (lead) => {
      const contactId = await persistLeadWithCrm(lead, { jobId, workspaceId, firstStageId });
      importedContacts.push(contactId);
      savedCount++;
    });

    await prisma.scrapingJob.update({
      where: { id: jobId },
      data: {
        stats: { found: leads.length, valid: savedCount, imported: importedContacts.length },
      },
    });

    await triggerFlowForScrapedLeads(workspaceId, importedContacts);

    console.log(`✅ [SCRAPER] Job ${jobId} finished. Saved ${savedCount} leads.`);
  } catch (err) {
    console.error(`❌ [SCRAPER] Job ${jobId} failed:`, err);
    await prisma.scrapingJob.update({ where: { id: jobId }, data: {} });
    throw err;
  }
}

export const scraperWorker = new Worker('scraper-jobs', processScraperJob, {
  connection,
  concurrency: 1, // Browser scraping is heavy, keep concurrency low
  limiter: {
    max: 5,
    duration: 1000,
  },
});
