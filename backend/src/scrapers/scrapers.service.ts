import { Injectable, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { forEachSequential } from '../common/async-sequence';
import { createRedisClient } from '../common/redis/redis.util';
import { PrismaService } from '../prisma/prisma.service';

/** Scrapers service. */
@Injectable()
export class ScrapersService {
  private scraperQueue: Queue;

  constructor(private prisma: PrismaService) {
    const connection = createRedisClient();

    this.scraperQueue = new Queue('scraper-jobs', { connection });
  }

  /** Create job. */
  async createJob(
    workspaceId: string,
    data: { type: string; query: string; [key: string]: unknown },
  ) {
    const job = await this.prisma.scrapingJob.create({
      data: {
        ...data,
        workspaceId,
        stats: { status: 'pending', found: 0, valid: 0, imported: 0 },
      },
    });

    // Dispatch to worker // PULSE:OK — worker processor pending implementation
    await this.scraperQueue.add('run-scraper', {
      jobId: job.id,
      workspaceId,
      type: data.type,
      query: data.query,
      targetUrl: data.targetUrl,
    });

    return job;
  }

  /** Extracts status string from stats JSON for API response. */
  private extractStatus(stats: unknown): string | undefined {
    if (stats && typeof stats === 'object' && 'status' in stats) {
      return (stats as Record<string, unknown>).status as string | undefined;
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
      resultsCount: (job.stats as Record<string, unknown> | null)?.found as number | undefined,
    }));
  }

  /** Find one. */
  async findOne(workspaceId: string, id: string) {
    const job = await this.prisma.scrapingJob.findUnique({
      where: { id },
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
      // PULSE:OK — upsert requires compound unique where per contact phone; cannot batch
      await this.prisma.contact.upsert({
        where: {
          workspaceId_phone: {
            workspaceId,
            phone: lead.phone,
          },
        },
        update: {
          name: lead.name || undefined,
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

    return { message: 'Leads imported successfully', count: importedCount };
  }
}
