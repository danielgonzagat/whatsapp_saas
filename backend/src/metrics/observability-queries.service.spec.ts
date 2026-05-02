import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ObservabilityQueriesService } from './observability-queries.service';

describe('ObservabilityQueriesService', () => {
  let service: ObservabilityQueriesService;
  let prisma: {
    metaConnection: { count: jest.Mock };
    message: { count: jest.Mock };
    autopilotEvent: { count: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      metaConnection: { count: jest.fn().mockResolvedValue(0) },
      message: { count: jest.fn().mockResolvedValue(0) },
      autopilotEvent: { count: jest.fn().mockResolvedValue(0) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ObservabilityQueriesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<ObservabilityQueriesService>(ObservabilityQueriesService);
  });

  describe('countConnectedMetaWorkspaces', () => {
    it('returns the count of connected meta connections across all workspaces', async () => {
      prisma.metaConnection.count.mockResolvedValue(5);

      const result = await service.countConnectedMetaWorkspaces();

      expect(result).toBe(5);
      expect(prisma.metaConnection.count).toHaveBeenCalledWith({
        where: { status: 'connected', workspaceId: undefined },
      });
    });

    it('returns zero when no connections exist', async () => {
      const result = await service.countConnectedMetaWorkspaces();

      expect(result).toBe(0);
    });
  });

  describe('countAllMessagesSince', () => {
    it('counts messages created after the given date across all workspaces', async () => {
      const since = new Date('2026-04-30T00:00:00Z');
      prisma.message.count.mockResolvedValue(42);

      const result = await service.countAllMessagesSince(since);

      expect(result).toBe(42);
      expect(prisma.message.count).toHaveBeenCalledWith({
        where: { createdAt: { gte: since }, workspaceId: undefined },
      });
    });

    it('returns zero when no messages in window', async () => {
      const since = new Date('2026-01-01T00:00:00Z');

      const result = await service.countAllMessagesSince(since);

      expect(result).toBe(0);
    });
  });

  describe('countAllAutopilotEventsSince', () => {
    it('counts autopilot events created after the given date across all workspaces', async () => {
      const since = new Date('2026-04-30T00:00:00Z');
      prisma.autopilotEvent.count.mockResolvedValue(99);

      const result = await service.countAllAutopilotEventsSince(since);

      expect(result).toBe(99);
      expect(prisma.autopilotEvent.count).toHaveBeenCalledWith({
        where: { createdAt: { gte: since }, workspaceId: undefined },
      });
    });
  });
});
