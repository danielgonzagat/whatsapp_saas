import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { forEachSequential } from '../common/async-sequence';
import { createBullMqConnectionOptions } from '../common/redis/redis.util';
import { PrismaService } from '../prisma/prisma.service';
import { QUEUE_NAMES } from '../queue/queue-names.const';

type ScraperStats = { status?: string; found?: number; [key: string]: unknown };
type CreateScraperJobPayload = {
  type: string;
  query: string;
  targetUrl?: string;
  flowId?: string;
  location?: string;
  filters?: unknown;
};

/** Scrapers service. */
@Injectable()
export class ScrapersService {
  private readonly logger = new Logger(ScrapersService.name);
  private scraperQueue: Queue;

  constructor(private prisma: PrismaService) {
    this.logger.log('ScrapersService initialized');
    const connection = createBullMqConnectionOptions();

    this.scraperQueue = new Queue(QUEUE_NAMES.SCRAPER, { connection });
  }

  /** Create job. */
  async createJob(workspaceId: string, data: CreateScraperJobPayload) {
    const filters: Record<string, Prisma.InputJsonValue> =
      data.filters && typeof data.filters === 'object' && !Array.isArray(data.filters)
        ? { ...(data.filters as Record<string, Prisma.InputJsonValue>) }
        : {};
    const normalizedLocation = typeof data.location === 'string' ? data.location.trim() : '';

    if (normalizedLocation) {
      filters.location = normalizedLocation;
    }

    const hasFilters = Object.keys(filters).length > 0;
    const createData: Prisma.ScrapingJobUncheckedCreateInput = {
      type: data.type,
      query: data.query,
      ...(data.targetUrl ? { targetUrl: data.targetUrl } : {}),
      ...(hasFilters ? { filters } : {}),
      workspaceId,
      stats: { status: 'pending', found: 0, valid: 0, imported: 0 },
    };
    const job = await this.prisma.scrapingJob.create({ data: createData });

    // Dispatch to worker
    await this.scraperQueue.add('run-scraper', {
      jobId: job.id,
      workspaceId,
      type: data.type,
      query: data.query,
      targetUrl: data.targetUrl,
      flowId: data.flowId,
      ...(hasFilters ? { filters } : {}),
    });

    return job;
  }

  /** Extracts status string from stats JSON for API response. */
  private extractStatus(stats: unknown): string | undefined {
    if (stats && typeof stats === 'object' && 'status' in stats) {
      return (stats as ScraperStats).status;
    }
    return undefined;
  }

  /** Find all. */
  async findAll(workspaceId: string) {
    const jobs = await this.prisma.scrapingJob.findMany({
      where: { workspaceId },
      select: {
        id: true,
        workspaceId: true,
        type: true,
        query: true,
        targetUrl: true,
        stats: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return jobs.map((job) => ({
      ...job,
      status: this.extractStatus(job.stats),
      resultsCount: (job.stats as ScraperStats | null)?.found,
    }));
  }

  /** Find one. */
  async findOne(workspaceId: string, id: string) {
    const job = await this.prisma.scrapingJob.findUnique({
      where: { id, workspaceId },
      include: { leads: true },
    });

    if (!job || job.workspaceId !== workspaceId) {
      throw new NotFoundException('Job not found');
    }
    return job;
  }

  /** Import leads. */
  async importLeads(workspaceId: string, jobId: string) {
    const job = await this.findOne(workspaceId, jobId);

    // Find valid leads not yet imported
    const leads = await this.prisma.scrapedLead.findMany({
      take: 1000,
      where: {
        jobId,
        isValid: true,
        isImported: false,
      },
      select: {
        id: true,
        jobId: true,
        name: true,
        phone: true,
        category: true,
        address: true,
        metadata: true,
      },
    });

    let importedCount = 0;

    await forEachSequential(leads, async (lead) => {
      await this.prisma.contact.upsert({
        where: {
          workspaceId_phone: {
            workspaceId,
            phone: lead.phone,
          },
        },
        update: {
          ...(lead.name !== undefined ? { name: lead.name } : {}),
          scrapingJobId: lead.jobId,
          scrapedFrom: `SCRAPER:${job.type}`,
          customFields: {
            category: lead.category,
            address: lead.address,
            source: `Scraper: ${job.type}`,
          },
        },
        create: {
          workspaceId,
          phone: lead.phone,
          name: lead.name,
          scrapingJobId: lead.jobId,
          scrapedFrom: `SCRAPER:${job.type}`,
          customFields: {
            category: lead.category,
            address: lead.address,
            source: `Scraper: ${job.type}`,
          },
        },
      });

      // Mark as imported
      await this.prisma.scrapedLead.update({
        where: { id: lead.id },
        data: { isImported: true },
      });

      importedCount++;
    });

    return {
      message: 'Leads imported successfully',
      count: importedCount,
      imported: importedCount,
    };
  }
}
