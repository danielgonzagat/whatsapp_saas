import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScrapersService } from './scrapers.service';

jest.mock('../common/redis/redis.util', () => ({
  createRedisClient: () => ({}),
  isRedisConfigured: () => true,
}));

const queueAddMock = jest.fn().mockResolvedValue(undefined);
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({ add: queueAddMock })),
}));

describe('ScrapersService', () => {
  let service: ScrapersService;
  let prisma: {
    scrapingJob: { create: jest.Mock; findMany: jest.Mock; findUnique: jest.Mock };
    scrapedLead: { findMany: jest.Mock; update: jest.Mock };
    contact: { upsert: jest.Mock };
  };

  beforeEach(() => {
    queueAddMock.mockClear();
    prisma = {
      scrapingJob: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'j-1', ...data })),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
      },
      scrapedLead: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      contact: { upsert: jest.fn().mockResolvedValue({}) },
    };
    service = new ScrapersService(prisma as PrismaService);
  });

  describe('createJob', () => {
    it('creates job with workspace scoping and dispatches to worker queue', async () => {
      await service.createJob('ws-1', {
        type: 'google-maps',
        query: 'restaurant',
      } as never);
      expect(prisma.scrapingJob.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workspaceId: 'ws-1',
          stats: { status: 'pending', found: 0, valid: 0, imported: 0 },
        }),
      });
      expect(queueAddMock).toHaveBeenCalledWith(
        'run-scraper',
        expect.objectContaining({ workspaceId: 'ws-1', type: 'google-maps' }),
      );
    });
  });

  describe('findAll', () => {
    it('filters by workspaceId and decorates rows with status/resultsCount', async () => {
      prisma.scrapingJob.findMany.mockResolvedValue([
        {
          id: 'j-1',
          workspaceId: 'ws-1',
          type: 'x',
          query: 'q',
          targetUrl: null,
          stats: { status: 'completed', found: 42 },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      const result = await service.findAll('ws-1');
      expect(result[0].status).toBe('completed');
      expect(result[0].resultsCount).toBe(42);
      expect(prisma.scrapingJob.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: 'ws-1' },
          take: 100,
        }),
      );
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when job missing', async () => {
      prisma.scrapingJob.findUnique.mockResolvedValue(null);
      await expect(service.findOne('ws-1', 'missing')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when job belongs to a different workspace', async () => {
      prisma.scrapingJob.findUnique.mockResolvedValue({
        id: 'j-1',
        workspaceId: 'OTHER-WS',
        leads: [],
      });
      await expect(service.findOne('ws-A', 'j-1')).rejects.toThrow(NotFoundException);
    });

    it('returns job with leads when valid', async () => {
      const job = { id: 'j-1', workspaceId: 'ws-1', leads: [{ id: 'l1' }] };
      prisma.scrapingJob.findUnique.mockResolvedValue(job);
      await expect(service.findOne('ws-1', 'j-1')).resolves.toEqual(job);
    });
  });

  describe('importLeads', () => {
    it('upserts contacts and marks leads as imported, returning count', async () => {
      prisma.scrapingJob.findUnique.mockResolvedValue({
        id: 'j-1',
        workspaceId: 'ws-1',
        type: 'google-maps',
        leads: [],
      });
      prisma.scrapedLead.findMany.mockResolvedValue([
        {
          id: 'lead-1',
          jobId: 'j-1',
          name: 'Lead 1',
          phone: '+5511',
          category: 'restaurant',
          address: 'Addr 1',
          metadata: {},
        },
      ]);
      const result = await service.importLeads('ws-1', 'j-1');
      expect(result.count).toBe(1);
      expect(prisma.contact.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId_phone: { workspaceId: 'ws-1', phone: '+5511' } },
        }),
      );
      expect(prisma.scrapedLead.update).toHaveBeenCalledWith({
        where: { id: 'lead-1' },
        data: { isImported: true },
      });
    });

    it('returns 0 when there are no valid unimported leads', async () => {
      prisma.scrapingJob.findUnique.mockResolvedValue({
        id: 'j-1',
        workspaceId: 'ws-1',
        type: 'x',
        leads: [],
      });
      prisma.scrapedLead.findMany.mockResolvedValue([]);
      const result = await service.importLeads('ws-1', 'j-1');
      expect(result.count).toBe(0);
    });
  });
});
