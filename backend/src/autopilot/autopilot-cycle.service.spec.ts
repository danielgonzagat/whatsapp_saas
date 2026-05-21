import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { SmartTimeService } from '../analytics/smart-time/smart-time.service';
import { AutopilotCycleExecutorService } from './autopilot-cycle-executor.service';
import { AutopilotCycleMoneyService } from './autopilot-cycle-money.service';
import { AutopilotCycleService } from './autopilot-cycle.service';

jest.mock('../queue/queue', () => ({
  autopilotQueue: {
    add: jest.fn().mockResolvedValue(undefined),
    getJobCounts: jest.fn().mockResolvedValue({ waiting: 3, delayed: 0, active: 1, failed: 2, completed: 10 }),
  },
}));

describe('AutopilotCycleService', () => {
  let service: AutopilotCycleService;
  let prisma: {
    workspace: { findUnique: jest.Mock };
    subscription: { findUnique: jest.Mock };
    conversation: { findMany: jest.Mock };
    message: { findFirst: jest.Mock };
    contact: { findFirst: jest.Mock };
  };
  let smartTime: { getBestTime: jest.Mock };
  let money: { moneyMachine: jest.Mock; nextBestAction: jest.Mock };
  let executor: { analyzeContext: jest.Mock; decideAction: jest.Mock; executeAction: jest.Mock };

  beforeEach(async () => {
    prisma = {
      workspace: { findUnique: jest.fn().mockResolvedValue({ providerSettings: {} }) },
      subscription: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }) },
      conversation: { findMany: jest.fn().mockResolvedValue([]) },
      message: { findFirst: jest.fn().mockResolvedValue(null) },
      contact: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    smartTime = { getBestTime: jest.fn().mockResolvedValue({ peakHour: 14, bestHours: [14], bestDays: ['Ter'] }) };
    money = { moneyMachine: jest.fn().mockResolvedValue({ created: [] }), nextBestAction: jest.fn().mockResolvedValue({ action: 'FOLLOW_UP_SOFT' }) };
    executor = { analyzeContext: jest.fn().mockResolvedValue({}), decideAction: jest.fn().mockResolvedValue('wait'), executeAction: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AutopilotCycleService,
        { provide: PrismaService, useValue: prisma },
        { provide: SmartTimeService, useValue: smartTime },
        { provide: AutopilotCycleMoneyService, useValue: money },
        { provide: AutopilotCycleExecutorService, useValue: executor },
      ],
    }).compile();

    service = module.get(AutopilotCycleService);
  });

  describe('getQueueStats', () => {
    it('returns formatted queue counts', async () => {
      const stats = await service.getQueueStats();
      expect(stats).toEqual({ waiting: 3, delayed: 0, active: 1, failed: 2, completed: 10 });
    });
  });

  describe('getRuntimeConfig', () => {
    it('returns default config from env fallbacks', () => {
      const config = service.getRuntimeConfig();
      expect(config).toHaveProperty('windowStart', 8);
      expect(config).toHaveProperty('windowEnd', 22);
      expect(config).toHaveProperty('cycleLimit', 200);
      expect(typeof config.windowStart).toBe('number');
    });
  });

  describe('runAutopilotCycle', () => {
    it('returns disabled status when legacy backend autopilot is off', async () => {
      const result = await service.runAutopilotCycle('ws-1');
      expect(result).toEqual({ status: 'disabled', reason: 'legacy_backend_autopilot_disabled' });
    });

    it('blocks workspace that is billing-suspended (tenant isolation)', async () => {
      process.env.ENABLE_LEGACY_BACKEND_AUTOPILOT = 'true';
      prisma.workspace.findUnique.mockResolvedValue({ providerSettings: { billingSuspended: true } });
      await expect(service.runAutopilotCycle('ws-bad')).rejects.toThrow(/suspenso/i);
      delete process.env.ENABLE_LEGACY_BACKEND_AUTOPILOT;
    });

    it('blocks workspace with CANCELED subscription', async () => {
      process.env.ENABLE_LEGACY_BACKEND_AUTOPILOT = 'true';
      prisma.workspace.findUnique.mockResolvedValue({ providerSettings: {} });
      prisma.subscription.findUnique.mockResolvedValue({ status: 'CANCELED' });
      await expect(service.runAutopilotCycle('ws-canceled')).rejects.toThrow(/Assinatura CANCELED/);
      delete process.env.ENABLE_LEGACY_BACKEND_AUTOPILOT;
    });
  });

  describe('moneyMachine', () => {
    it('checks suspension then delegates to money service', async () => {
      prisma.workspace.findUnique.mockResolvedValue({ providerSettings: {} });
      prisma.subscription.findUnique.mockResolvedValue({ status: 'ACTIVE' });
      money.moneyMachine.mockResolvedValue({ created: ['c1', 'c2', 'c3'], segments: { hot: 1, warm: 0, cold: 0 } });
      const result = await service.moneyMachine('ws-1');
      expect(money.moneyMachine).toHaveBeenCalledWith('ws-1', 200, false, false);
      expect(result).toEqual({ created: ['c1', 'c2', 'c3'], segments: { hot: 1, warm: 0, cold: 0 } });
    });
  });

  describe('nextBestAction', () => {
    it('delegates to money service with workspace and contact', async () => {
      money.nextBestAction.mockResolvedValue({ action: 'FOLLOW_UP_SOFT', reason: 'keep_warm' });
      const result = await service.nextBestAction('ws-1', 'contact-xyz');
      expect(money.nextBestAction).toHaveBeenCalledWith('ws-1', 'contact-xyz');
      expect(result).toEqual({ action: 'FOLLOW_UP_SOFT', reason: 'keep_warm' });
    });

    it('propagates error from money service', async () => {
      money.nextBestAction.mockRejectedValue(new Error('db down'));
      await expect(service.nextBestAction('ws-1', 'contact-err')).rejects.toThrow('db down');
    });
  });

  describe('ensureCompliance', () => {
    it('returns allowed true when enforce flags are off', async () => {
      const result = await service.ensureCompliance(
        'ws-1',
        { id: 'ct-1', phone: '5511999999999' },
        [],
      );
      expect(result).toEqual({ allowed: true });
    });

    it('rejects contact with missing optin when ENFORCE_OPTIN is true', async () => {
      process.env.ENFORCE_OPTIN = 'true';
      prisma.contact.findFirst.mockResolvedValue({
        customFields: {},
        tags: [],
      });
      const result = await service.ensureCompliance(
        'ws-1',
        { id: 'ct-nopt', phone: '5511999999999', tags: [], customFields: {} },
        [],
      );
      expect(result).toEqual({ allowed: false, reason: 'optin_required' });
      delete process.env.ENFORCE_OPTIN;
    });
  });
});
