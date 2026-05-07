import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from './audit.service';
import { PrismaService } from '../prisma/prisma.service';

function buildMockPrisma(overrides: Record<string, unknown> = {}) {
  return {
    auditLog: {
      create: jest.fn().mockResolvedValue({ id: 'log-1' }),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    ...overrides,
  };
}

describe('AuditService', () => {
  let service: AuditService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
  });

  describe('log', () => {
    const defaultLogData = {
      workspaceId: 'ws-1',
      action: 'CREATE_FLOW',
      resource: 'Flow',
      resourceId: 'flow-1',
      agentId: 'agent-1',
      details: { key: 'value' },
    };

    it('writes an audit log entry via prisma', async () => {
      mockPrisma.auditLog.create.mockResolvedValue({ id: 'log-1' });

      await service.log(defaultLogData);

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          workspaceId: 'ws-1',
          action: 'CREATE_FLOW',
          resource: 'Flow',
          resourceId: 'flow-1',
          agentId: 'agent-1',
          details: { key: 'value' },
          ipAddress: undefined,
          userAgent: undefined,
        },
      });
    });

    it('defaults details to empty object when missing', async () => {
      await service.log({
        workspaceId: 'ws-2',
        action: 'DELETE_CONTACT',
        resource: 'Contact',
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            details: {},
          }),
        }),
      );
    });

    it('retries once when the first create fails', async () => {
      const prismaWithRetry = buildMockPrisma();
      prismaWithRetry.auditLog.create
        .mockRejectedValueOnce(new Error('connection lost'))
        .mockResolvedValueOnce({ id: 'log-retry' });

      const moduleRetry: TestingModule = await Test.createTestingModule({
        providers: [AuditService, { provide: PrismaService, useValue: prismaWithRetry }],
      }).compile();
      const svc = moduleRetry.get<AuditService>(AuditService);

      await svc.log(defaultLogData);

      expect(prismaWithRetry.auditLog.create).toHaveBeenCalledTimes(2);
    });

    it('suppresses error when both create and retry fail', async () => {
      const prismaWithFailures = buildMockPrisma();
      prismaWithFailures.auditLog.create
        .mockRejectedValueOnce(new Error('conn lost'))
        .mockRejectedValueOnce(new Error('retry also failed'));

      const moduleFail: TestingModule = await Test.createTestingModule({
        providers: [AuditService, { provide: PrismaService, useValue: prismaWithFailures }],
      }).compile();
      const svc = moduleFail.get<AuditService>(AuditService);

      // Must not throw — log() swallows errors
      await expect(svc.log(defaultLogData)).resolves.toBeUndefined();
      expect(prismaWithFailures.auditLog.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('logWithTx', () => {
    it('writes via the provided transaction client', async () => {
      const txCreate = jest.fn().mockResolvedValue({ id: 'tx-log-1' });
      const tx = { auditLog: { create: txCreate } };

      await service.logWithTx(tx, {
        workspaceId: 'ws-tx',
        action: 'TX_ACTION',
        resource: 'TxResource',
        resourceId: 'res-1',
      });

      expect(txCreate).toHaveBeenCalledWith({
        data: {
          workspaceId: 'ws-tx',
          action: 'TX_ACTION',
          resource: 'TxResource',
          resourceId: 'res-1',
          agentId: undefined,
          details: {},
          ipAddress: undefined,
          userAgent: undefined,
        },
      });
    });
  });

  describe('getLogs', () => {
    it('returns paginated audit logs with total count', async () => {
      const logs = [
        { id: 'l1', action: 'CREATE_FLOW', resource: 'Flow', workspaceId: 'ws-1' },
        { id: 'l2', action: 'DELETE_CONTACT', resource: 'Contact', workspaceId: 'ws-1' },
      ];
      mockPrisma.auditLog.findMany.mockResolvedValue(logs);
      mockPrisma.auditLog.count.mockResolvedValue(45);

      const result = await service.getLogs('ws-1', 20, 0);

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1' },
        orderBy: { createdAt: 'desc' },
        take: 20,
        skip: 0,
        include: { agent: { select: { name: true, email: true } } },
      });
      expect(mockPrisma.auditLog.count).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1' },
      });
      expect(result).toEqual({
        data: logs,
        total: 45,
        page: 1,
        lastPage: 3,
      });
    });

    it('calculates page and lastPage from offset and limit', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(50);

      const result = await service.getLogs('ws-2', 10, 30);

      expect(result.page).toBe(4);
      expect(result.lastPage).toBe(5);
    });

    it('defaults limit to 50 and offset to 0', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      await service.getLogs('ws-3');

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50, skip: 0 }),
      );
    });
  });
});
