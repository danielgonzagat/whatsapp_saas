import { Worker, Job } from 'bullmq';
import { connection } from './queue';
import { prisma } from './db';
import { scrapeGoogleMaps } from './scrapers/google-maps';
import { triggerFlowForScrapedLeads } from './scrapers/auto-trigger';

/**
 * =======================================================
 * SCRAPER ENGINE — GOOGLE MAPS & INSTAGRAM
 * =======================================================
 *
 * Uses Puppeteer (Real Browser) for Maps.
 * Uses Mocks for Instagram (Temporary).
 */

export const scraperWorker = new Worker(
  'scraper-jobs',
  async (job: Job) => {
    console.log(`\n🕷️ [SCRAPER] Starting job ${job.id} (${job.data.type})`);
    const { jobId, query, type, workspaceId } = job.data;

    try {
      await prisma.scrapingJob.update({
        where: { id: jobId },
        data: {},
      });

      let leads: any[] = [];

      if (type === 'MAPS') {
        console.log(`[SCRAPER] Launching Real Browser for Maps query: "${query}"`);
        // Executa o scraper real
        const rawLeads = await scrapeGoogleMaps(query, 20);

        // Normaliza os dados
        leads = rawLeads.map((l) => ({
          phone: l.phone || '', // Pode vir vazio se não clicar
          name: l.name,
          category: l.category,
          address: l.address,
          metadata: { source: 'Google Maps', raw: l },
        }));
      } else if (type === 'INSTAGRAM') {
        console.log(`[SCRAPER] Launching Real Browser for Instagram query: "${query}"`);
        const { scrapeInstagram } = await import('./scrapers/instagram');
        const rawLeads = await scrapeInstagram(query, 5);

        leads = rawLeads.map((l) => ({
          phone: l.phone || '',
          name: l.name,
          category: l.category,
          address: l.address,
          metadata: { source: 'Instagram', ...l.metadata },
        }));
      } else if (type === 'GROUP') {
        console.log(
          `[SCRAPER] Group scraping not yet implemented for: "${query || job.data.targetUrl}"`,
        );
        // Placeholder: real group member extraction requires WhatsApp Web integration.
        // No fake data is generated — returns empty leads until a real implementation is added.
        leads = [];
      }

      // Salvar leads no DB e importar para CRM (pipeline/default)
      let savedCount = 0;
      // Garantir pipeline padrão
      // Garantir pipeline padrão (busca por workspace)
      let pipeline = await prisma.pipeline.findFirst({ where: { workspaceId } });
      if (!pipeline) {
        pipeline = await prisma.pipeline.create({
          data: {
            name: 'Funil de Vendas',
            workspaceId,
          },
        });
      }

      // Garantir pelo menos um stage
      let stage = await prisma.stage.findFirst({
        where: { pipelineId: pipeline.id },
        orderBy: { order: 'asc' },
      });

      if (!stage) {
        stage = await prisma.stage.create({
          data: {
            name: 'Lead',
            order: 1,
            color: '#3b82f6',
            pipelineId: pipeline.id,
          },
        });
      }

      const firstStageId = stage.id;

      const importedContacts: string[] = [];
      for (const lead of leads) {
        const scraped = await prisma.scrapedLead.create({
          data: {
            jobId,
            phone: lead.phone || 'N/A',
            name: lead.name,
            category: lead.category,
            address: lead.address || '',
            metadata: lead.metadata || {},
            isValid: !!lead.phone, // Só é valido pra contato imediato se tiver telefone
          },
        });
        savedCount++;

        // Importar para CRM (Contato + Deal)
        const contact = await prisma.contact.upsert({
          where: { workspaceId_phone: { workspaceId, phone: scraped.phone } },
          update: { name: scraped.name, customFields: scraped.metadata || {} },
          create: {
            workspaceId,
            phone: scraped.phone,
            name: scraped.name,
            customFields: scraped.metadata || {},
          },
        });
        importedContacts.push(contact.id);

        if (firstStageId) {
          await prisma.deal.create({
            data: {
              title: scraped.name || 'Lead',
              value: 0,
              status: 'OPEN',
              contactId: contact.id,
              stageId: firstStageId,
            },
          });
        }
      }

      await prisma.scrapingJob.update({
        where: { id: jobId },
        data: {
          stats: { found: leads.length, valid: savedCount, imported: importedContacts.length },
        },
      });

      // Opcional: disparar fluxo automático para os contatos importados
      await triggerFlowForScrapedLeads(workspaceId, importedContacts);

      console.log(`✅ [SCRAPER] Job ${jobId} finished. Saved ${savedCount} leads.`);
    } catch (err) {
      console.error(`❌ [SCRAPER] Job ${jobId} failed:`, err);
      await prisma.scrapingJob.update({
        where: { id: jobId },
        data: {},
      });
      throw err;
    }
  },
  {
    connection,
    concurrency: 1, // Browser scraping is heavy, keep concurrency low
    limiter: {
      max: 5,
      duration: 1000,
    },
  },
);
