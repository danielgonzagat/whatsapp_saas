import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

@Injectable()
export class ScrapersService {
  private scraperQueue: Queue;

  constructor(private prisma: PrismaService) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error('REDIS_URL environment variable is required');
    }
    const connection = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
    });

    this.scraperQueue = new Queue('scraper-jobs', { connection });
  }

  async createJob(workspaceId: string, data: any) {
    const job = await this.prisma.scrapingJob.create({
      data: {
        ...data,
        workspaceId,
        status: 'PENDING',
        stats: { found: 0, valid: 0, imported: 0 },
      },
    });

    // Dispatch to worker
    await this.scraperQueue.add('run-scraper', {
      jobId: job.id,
      workspaceId,
      type: data.type,
      query: data.query,
      targetUrl: data.targetUrl,
    });

    return job;
  }

  async findAll(workspaceId: string) {
    return this.prisma.scrapingJob.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
  }

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

  async importLeads(workspaceId: string, jobId: string) {
    const job = await this.findOne(workspaceId, jobId);

    // Find valid leads not yet imported
    const leads = await this.prisma.scrapedLead.findMany({
      where: {
        jobId,
        isValid: true,
        isImported: false,
      },
    });

    let importedCount = 0;

    for (const lead of leads) {
      // Add to CRM
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
    }

    return { message: 'Leads imported successfully', count: importedCount };
  }
}
