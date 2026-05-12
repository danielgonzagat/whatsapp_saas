import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { SmartTimeService } from '../analytics/smart-time/smart-time.service';
import { AutopilotCycleMoneyService } from './autopilot-cycle-money.service';

jest.mock('../common/redis/redis.util', () => ({
  createRedisClient: () => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    incr: jest.fn(),
    decr: jest.fn(),
    expire: jest.fn(),
  }),
  isRedisConfigured: () => true,
}));

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
  })),
}));

describe('AutopilotCycleMoneyService', () => {
  let service: AutopilotCycleMoneyService;
  let prisma: {
    conversation: { findMany: jest.Mock; findFirst: jest.Mock };
    contact: { findFirst: jest.Mock };
    campaign: { create: jest.Mock; updateMany: jest.Mock };
    auditLog: { createMany: jest.Mock };
  };
  let smartTime: { getBestTime: jest.Mock };

  beforeEach(async () => {
    prisma = {
      conversation: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      contact: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      campaign: {
        create: jest.fn().mockImplementation((args: { data: { name: string } }) =>
          Promise.resolve({ id: `c-${args.data.name.replace(/\s+/g, '-').toLowerCase()}`, ...args.data }),
        ),
        updateMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
      auditLog: {
        createMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
    };
    smartTime = {
      getBestTime: jest.fn().mockResolvedValue({ peakHour: 14, bestHours: [14], bestDays: ['Ter'] }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AutopilotCycleMoneyService,
        { provide: PrismaService, useValue: prisma },
        { provide: SmartTimeService, useValue: smartTime },
      ],
    }).compile();

    service = module.get(AutopilotCycleMoneyService);
  });

  describe('computeSmartDelay', () => {
    it('returns 0 when useSmartTime is false', async () => {
      const delay = await service.computeSmartDelay('ws-1', false);
      expect(delay).toBe(0);
    });

    it('returns millisecond delay to next peak hour', async () => {
      const delay = await service.computeSmartDelay('ws-1', true);
      expect(delay).toBeGreaterThan(0);
      expect(delay).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
    });
  });

  describe('moneyMachine', () => {
    it('returns disabled when legacy backend autopilot is off', async () => {
      const result = await service.moneyMachine('ws-1');
      expect(result).toEqual({
        created: [],
        segments: { hot: 0, warm: 0, cold: 0 },
        autoSend: false,
        scheduledAt: null,
        status: 'disabled',
        reason: 'legacy_backend_autopilot_disabled',
      });
    });

    it('creates 3 campaigns when legacy is enabled with conversations', async () => {
      process.env.ENABLE_LEGACY_BACKEND_AUTOPILOT = 'true';
      prisma.conversation.findMany.mockResolvedValue([
        {
          contact: { phone: '5511999999991', name: 'Lead Hot' },
          messages: [{ content: 'quero comprar, qual o preço?', createdAt: new Date() }],
        },
        {
          contact: { phone: '5511999999992', name: 'Lead Cold' },
          messages: [{ content: 'olá', createdAt: new Date(Date.now() - 100 * 3600000) }],
        },
      ]);

      const result = await service.moneyMachine('ws-1');
      expect(result.created).toHaveLength(3);
      expect(prisma.campaign.create).toHaveBeenCalledTimes(3);
      expect(result.segments.hot).toBeGreaterThanOrEqual(0);
      delete process.env.ENABLE_LEGACY_BACKEND_AUTOPILOT;
    });

    it('rethrows upstream error from prisma', async () => {
      process.env.ENABLE_LEGACY_BACKEND_AUTOPILOT = 'true';
      prisma.conversation.findMany.mockRejectedValue(new Error('connection refused'));
      await expect(service.moneyMachine('ws-err')).rejects.toThrow('connection refused');
      delete process.env.ENABLE_LEGACY_BACKEND_AUTOPILOT;
    });
  });

  describe('nextBestAction', () => {
    it('returns action for a known contact in workspace', async () => {
      prisma.contact.findFirst.mockResolvedValue({ id: 'ct-1', phone: '5511999999999', name: 'João' });
      prisma.conversation.findFirst = jest.fn().mockResolvedValue({
        messages: [{ content: 'qual o valor?', direction: 'INBOUND', createdAt: new Date() }],
      });

      const result = await service.nextBestAction('ws-1', 'ct-1');
      expect(result).toHaveProperty('workspaceId', 'ws-1');
      expect(result).toHaveProperty('contactId', 'ct-1');
      expect(result).toHaveProperty('action');
      expect(result).toHaveProperty('reason');
    });

    it('throws NotFoundException when contact does not belong to workspace (tenant isolation)', async () => {
      prisma.contact.findFirst.mockResolvedValue(null);
      await expect(service.nextBestAction('ws-other', 'ct-missing')).rejects.toThrow(NotFoundException);
    });

    it('rethrows upstream error from prisma', async () => {
      prisma.contact.findFirst.mockRejectedValue(new Error('db timeout'));
      await expect(service.nextBestAction('ws-1', 'ct-err')).rejects.toThrow('db timeout');
    });
  });
});
