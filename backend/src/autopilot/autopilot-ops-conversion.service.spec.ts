import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AutopilotOpsConversionService } from './autopilot-ops-conversion.service';

jest.mock('../queue/queue', () => ({
  autopilotQueue: {
    add: jest.fn().mockResolvedValue(undefined),
  },
  flowQueue: {
    add: jest.fn().mockResolvedValue(undefined),
  },
  campaignQueue: {
    add: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('AutopilotOpsConversionService', () => {
  let service: AutopilotOpsConversionService;
  let prisma: {
    workspace: { findUnique: jest.Mock };
    subscription: { findUnique: jest.Mock };
    contact: { findFirst: jest.Mock; findUnique: jest.Mock; updateMany: jest.Mock };
    autopilotEvent: { count: jest.Mock; findFirst: jest.Mock; create: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      workspace: { findUnique: jest.fn().mockResolvedValue({ id: 'ws-1', providerSettings: {} }) },
      subscription: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }) },
      contact: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'ct-1', customFields: null, phone: '5511999999999' }),
        findUnique: jest.fn().mockResolvedValue({ id: 'ct-1', phone: '5511999999999' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      autopilotEvent: {
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'evt-1' }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AutopilotOpsConversionService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(AutopilotOpsConversionService);
  });

  describe('retryContact', () => {
    it('enqueues scan-contact job when no cooldown or errors present', async () => {
      const result = await service.retryContact('ws-1', 'ct-1');
      expect(result).toEqual({ queued: true, scheduled: false });
    });

    it('schedules delayed retry when more than 3 errors in last hour', async () => {
      prisma.autopilotEvent.count.mockResolvedValue(4);
      const result = await service.retryContact('ws-1', 'ct-1');
      expect(result).toMatchObject({
        queued: true,
        scheduled: true,
        reason: 'rate_limited_error_1h',
        delayMs: result.delayMs,
      });
      expect(typeof result.delayMs).toBe('number');
      expect(prisma.autopilotEvent.create).toHaveBeenCalled();
    });

    it('schedules cooldown retry when last event was less than 5 minutes ago', async () => {
      const recentEvent = new Date(Date.now() - 2 * 60 * 1000);
      prisma.autopilotEvent.findFirst.mockResolvedValue({ createdAt: recentEvent });
      const result = await service.retryContact('ws-1', 'ct-1');
      expect(result).toMatchObject({
        queued: true,
        scheduled: true,
        reason: 'cooldown_5m',
      });
    });

    it('returns already scheduled when autopilotNextRetryAt is in the future', async () => {
      const futureRetry = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      prisma.contact.findFirst.mockResolvedValue({
        id: 'ct-1',
        customFields: { autopilotNextRetryAt: futureRetry },
      });
      const result = await service.retryContact('ws-1', 'ct-1');
      expect(result).toEqual({
        queued: false,
        reason: 'retry_already_scheduled',
        nextRetryAt: result.nextRetryAt,
      });
      expect(typeof result.nextRetryAt).toBe('string');
    });

    it('throws ForbiddenException for billing-suspended workspace (tenant isolation)', async () => {
      prisma.workspace.findUnique.mockResolvedValue({
        providerSettings: { billingSuspended: true },
      });
      await expect(service.retryContact('ws-suspended', 'ct-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws ForbiddenException for CANCELED subscription', async () => {
      prisma.subscription.findUnique.mockResolvedValue({ status: 'CANCELED' });
      await expect(service.retryContact('ws-canceled', 'ct-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('markConversion', () => {
    it('creates autopilot event and returns ok', async () => {
      const result = await service.markConversion({
        workspaceId: 'ws-1',
        contactId: 'ct-1',
        reason: 'test',
      });
      expect(result).toEqual({ ok: true, contactId: 'ct-1' });
      expect(prisma.autopilotEvent.create).toHaveBeenCalled();
    });

    it('resolves contactId from phone when not provided', async () => {
      prisma.contact.findUnique.mockResolvedValue({ id: 'ct-byphone', phone: '5511999999999' });
      const result = await service.markConversion({ workspaceId: 'ws-1', phone: '5511999999999' });
      expect(result).toHaveProperty('ok', true);
    });

    it('dedupes by orderId when existing conversion event found', async () => {
      prisma.autopilotEvent.findFirst.mockResolvedValue({
        id: 'evt-existing',
        contactId: 'ct-dedup',
      });
      const result = await service.markConversion({
        workspaceId: 'ws-1',
        contactId: 'ct-1',
        meta: { orderId: 'ord-123' },
      });
      expect(result).toEqual({ ok: true, contactId: 'ct-dedup', deduped: true });
    });

    it('throws ForbiddenException for billing-suspended workspace (tenant isolation)', async () => {
      prisma.workspace.findUnique.mockResolvedValue({
        providerSettings: { billingSuspended: true },
      });
      await expect(
        service.markConversion({ workspaceId: 'ws-suspended', contactId: 'ct-1' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rethrows upstream error from prisma', async () => {
      prisma.workspace.findUnique.mockRejectedValue(new Error('connection lost'));
      await expect(
        service.markConversion({ workspaceId: 'ws-1', contactId: 'ct-err' }),
      ).rejects.toThrow('connection lost');
    });
  });
});
