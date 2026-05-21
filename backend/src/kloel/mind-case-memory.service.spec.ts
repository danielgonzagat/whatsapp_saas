import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { MindCaseMemoryService } from './mind-case-memory.service';

describe('MindCaseMemoryService', () => {
  let service: MindCaseMemoryService;
  let prisma: {
    mindCase: { create: jest.Mock; findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      mindCase: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve(data)),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MindCaseMemoryService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(MindCaseMemoryService);
  });

  describe('recordCase', () => {
    it('tokenizes text and persists with workspace scoping', async () => {
      const result = await service.recordCase({
        workspaceId: 'ws-1',
        subject: 'lead',
        caseType: 'reply',
        text: 'Hello world, this is an example case for the agent',
        features: { intent: 'BUY' },
        action: 'send',
      });
      expect((result as { workspaceId: string }).workspaceId).toBe('ws-1');
      expect((result as { tokens: string[] }).tokens).toEqual(
        expect.arrayContaining(['hello', 'world']),
      );
      // dropped tokens of length <= 2
      expect((result as { tokens: string[] }).tokens).not.toContain('is');
    });

    it('defaults occurredAt to a fresh Date and outcome to null', async () => {
      const before = Date.now();
      const result = await service.recordCase({
        workspaceId: 'ws-1',
        subject: 'lead',
        caseType: 'reply',
        text: 'short text body',
        features: {},
        action: 'send',
      });
      const r = result as { outcome: number | null; occurredAt: Date };
      expect(r.outcome).toBeNull();
      expect(r.occurredAt.getTime()).toBeGreaterThanOrEqual(before);
    });
  });

  describe('similar', () => {
    it('enforces workspace isolation in the Prisma query', async () => {
      await service.similar({ workspaceId: 'ws-tenant-A', text: 'hi' });
      const arg = prisma.mindCase.findMany.mock.calls[0][0];
      expect(arg.where.workspaceId).toBe('ws-tenant-A');
    });

    it('filters by caseType when provided', async () => {
      await service.similar({ workspaceId: 'ws-1', text: 'hi', caseType: 'reply' });
      const arg = prisma.mindCase.findMany.mock.calls[0][0];
      expect(arg.where.caseType).toBe('reply');
    });

    it('ranks cases by Jaccard token similarity descending', async () => {
      prisma.mindCase.findMany.mockResolvedValue([
        { id: 'a', tokens: ['payment', 'failed'], features: {}, outcome: null },
        { id: 'b', tokens: ['greeting', 'welcome'], features: {}, outcome: null },
        { id: 'c', tokens: ['payment', 'success', 'transaction'], features: {}, outcome: null },
      ]);
      const result = await service.similar({
        workspaceId: 'ws-1',
        text: 'payment refund failed transaction',
      });
      expect(result[0].id).toBe('a');
    });

    it('respects limit', async () => {
      prisma.mindCase.findMany.mockResolvedValue([
        { id: '1', tokens: [], features: {}, outcome: null },
        { id: '2', tokens: [], features: {}, outcome: null },
        { id: '3', tokens: [], features: {}, outcome: null },
      ]);
      const result = await service.similar({ workspaceId: 'ws-1', text: 'x', limit: 2 });
      expect(result).toHaveLength(2);
    });
  });
});
