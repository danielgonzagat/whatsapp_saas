import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import { PlanLimitsService } from './plan-limits.service';

const REDIS_TOKEN = 'default_IORedisModuleConnectionToken';

describe('PlanLimitsService', () => {
  let service: PlanLimitsService;
  let prisma: {
    subscription: { findUnique: jest.Mock };
    workspace: { findUnique: jest.Mock };
    flow: { count: jest.Mock };
    campaign: { count: jest.Mock };
  };
  let redis: {
    incr: jest.Mock;
    expire: jest.Mock;
    set: jest.Mock;
    get: jest.Mock;
    pexpire: jest.Mock;
  };
  let opsAlert: { alertOnCriticalError: jest.Mock };

  beforeEach(async () => {
    prisma = {
      subscription: { findUnique: jest.fn().mockResolvedValue(null) },
      workspace: { findUnique: jest.fn().mockResolvedValue({ providerSettings: {} }) },
      flow: { count: jest.fn().mockResolvedValue(0) },
      campaign: { count: jest.fn().mockResolvedValue(0) },
    };
    redis = {
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue(null),
      pexpire: jest.fn().mockResolvedValue(1),
    };
    opsAlert = { alertOnCriticalError: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlanLimitsService,
        { provide: PrismaService, useValue: prisma },
        { provide: REDIS_TOKEN, useValue: redis },
        { provide: OpsAlertService, useValue: opsAlert },
      ],
    }).compile();

    service = module.get(PlanLimitsService);
  });

  describe('ensureFlowLimit', () => {
    it('allows creation under FREE plan limit', async () => {
      prisma.flow.count.mockResolvedValue(0);
      await expect(service.ensureFlowLimit('ws-1')).resolves.toBeUndefined();
      expect(prisma.flow.count).toHaveBeenCalledWith({ where: { workspaceId: 'ws-1' } });
    });

    it('blocks creation when FREE plan limit reached', async () => {
      prisma.flow.count.mockResolvedValue(1);
      await expect(service.ensureFlowLimit('ws-1')).rejects.toThrow(ForbiddenException);
    });

    it('falls back to FREE when subscription absent', async () => {
      prisma.subscription.findUnique.mockResolvedValue(null);
      prisma.flow.count.mockResolvedValue(0);
      await expect(service.ensureFlowLimit('ws-1')).resolves.toBeUndefined();
    });
  });

  describe('ensureCampaignLimit', () => {
    it('allows creation under FREE limit', async () => {
      prisma.campaign.count.mockResolvedValue(0);
      await expect(service.ensureCampaignLimit('ws-1')).resolves.toBeUndefined();
    });

    it('blocks creation at FREE limit', async () => {
      prisma.campaign.count.mockResolvedValue(1);
      await expect(service.ensureCampaignLimit('ws-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('ensureSubscriptionActive', () => {
    it('passes when no subscription (FREE workspaces still send)', async () => {
      prisma.subscription.findUnique.mockResolvedValue(null);
      await expect(service.ensureSubscriptionActive('ws-1')).resolves.toBeUndefined();
    });

    it('passes for ACTIVE subscription', async () => {
      prisma.subscription.findUnique.mockResolvedValue({ status: 'ACTIVE' });
      await expect(service.ensureSubscriptionActive('ws-1')).resolves.toBeUndefined();
    });

    it('throws ForbiddenException for CANCELED subscription', async () => {
      prisma.subscription.findUnique.mockResolvedValue({ status: 'CANCELED' });
      await expect(service.ensureSubscriptionActive('ws-1')).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException for PAST_DUE subscription', async () => {
      prisma.subscription.findUnique.mockResolvedValue({ status: 'PAST_DUE' });
      await expect(service.ensureSubscriptionActive('ws-1')).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when billing is suspended via providerSettings', async () => {
      prisma.workspace.findUnique.mockResolvedValue({
        providerSettings: { billingSuspended: true },
      });
      await expect(service.ensureSubscriptionActive('ws-1')).rejects.toThrow(/suspensos/i);
    });
  });

  describe('trackMessageSend (workspace isolation)', () => {
    it('increments per-workspace key in Redis', async () => {
      prisma.subscription.findUnique.mockResolvedValue({ plan: 'PRO', status: 'ACTIVE' });
      redis.incr.mockResolvedValue(1);
      await service.trackMessageSend('ws-A');
      expect(redis.incr).toHaveBeenCalledWith(expect.stringContaining('ws-A'));
    });

    it('increments Redis counter on FREE plan (limit-check internal to service)', async () => {
      prisma.subscription.findUnique.mockResolvedValue(null); // FREE
      redis.incr.mockResolvedValue(10); // within limit (FREE.messagesPerMonth=500)
      await expect(service.trackMessageSend('ws-A')).resolves.toBeUndefined();
      expect(redis.incr).toHaveBeenCalled();
    });

    it('does not enforce when subscription has no messagesPerMonth limit (ENTERPRISE)', async () => {
      prisma.subscription.findUnique.mockResolvedValue({ plan: 'ENTERPRISE', status: 'ACTIVE' });
      await expect(service.trackMessageSend('ws-A')).resolves.toBeUndefined();
      // ENTERPRISE has unlimited messages; Redis should not be touched.
      expect(redis.incr).not.toHaveBeenCalled();
    });
  });
});
