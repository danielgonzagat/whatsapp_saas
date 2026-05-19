import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AutopilotOpsConversionService } from './autopilot-ops-conversion.service';
import { AutopilotOpsService } from './autopilot-ops.service';

jest.mock('../queue/queue', () => ({
  autopilotQueue: {
    add: jest.fn().mockResolvedValue(undefined),
    getJobCounts: jest.fn().mockResolvedValue({ waiting: 0, active: 0, delayed: 0, failed: 0 }),
  },
  flowQueue: {
    add: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../common/redis/redis.util', () => ({
  createRedisClient: () => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  }),
  isRedisConfigured: () => true,
}));

describe('AutopilotOpsService', () => {
  let service: AutopilotOpsService;
  let prisma: {
    workspace: { findUnique: jest.Mock };
    subscription: { findUnique: jest.Mock };
    message: { count: jest.Mock; findFirst: jest.Mock };
    autopilotEvent: { count: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock };
    contact: { upsert: jest.Mock };
  };
  let conversion: { retryContact: jest.Mock; markConversion: jest.Mock };

  beforeEach(async () => {
    prisma = {
      workspace: { findUnique: jest.fn().mockResolvedValue({ id: 'ws-1', name: 'Test WS', providerSettings: {} }) },
      subscription: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }) },
      message: {
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      autopilotEvent: {
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      contact: {
        upsert: jest.fn().mockResolvedValue({ id: 'ct-1' }),
      },
    };
    conversion = {
      retryContact: jest.fn().mockResolvedValue({ queued: true }),
      markConversion: jest.fn().mockResolvedValue({ ok: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AutopilotOpsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AutopilotOpsConversionService, useValue: conversion },
      ],
    }).compile();

    service = module.get(AutopilotOpsService);
  });

  describe('enqueueProcessing', () => {
    it('enqueues scan-contact job successfully', async () => {
      const result = await service.enqueueProcessing({ workspaceId: 'ws-1', phone: '5511999999999' });
      expect(result).toEqual({ queued: true });
    });

    it('throws BadRequestException when neither phone nor contactId provided', async () => {
      await expect(service.enqueueProcessing({ workspaceId: 'ws-1' })).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException for billing-suspended workspace (tenant isolation)', async () => {
      prisma.workspace.findUnique.mockResolvedValue({ providerSettings: { billingSuspended: true } });
      await expect(service.enqueueProcessing({ workspaceId: 'ws-bad', phone: '5511999999999' })).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException for CANCELED subscription', async () => {
      prisma.subscription.findUnique.mockResolvedValue({ status: 'CANCELED' });
      await expect(service.enqueueProcessing({ workspaceId: 'ws-canceled', phone: '5511999999999' })).rejects.toThrow(ForbiddenException);
    });
  });

  describe('retryContact', () => {
    it('delegates to conversion service', async () => {
      conversion.retryContact.mockResolvedValue({ queued: true, scheduled: false });
      const result = await service.retryContact('ws-1', 'ct-1');
      expect(conversion.retryContact).toHaveBeenCalledWith('ws-1', 'ct-1');
      expect(result).toEqual({ queued: true, scheduled: false });
    });

    it('propagates error from conversion service', async () => {
      conversion.retryContact.mockRejectedValue(new Error('redis error'));
      await expect(service.retryContact('ws-1', 'ct-err')).rejects.toThrow('redis error');
    });
  });

  describe('markConversion', () => {
    it('delegates to conversion service', async () => {
      conversion.markConversion.mockResolvedValue({ ok: true, contactId: 'ct-1' });
      const result = await service.markConversion({ workspaceId: 'ws-1', contactId: 'ct-1' });
      expect(conversion.markConversion).toHaveBeenCalledWith({ workspaceId: 'ws-1', contactId: 'ct-1' });
      expect(result).toEqual({ ok: true, contactId: 'ct-1' });
    });
  });

  describe('getPipelineStatus', () => {
    it('returns pipeline snapshot for workspace', async () => {
      const result = await service.getPipelineStatus('ws-1');
      expect(result).toHaveProperty('workspaceId', 'ws-1');
      expect(result).toHaveProperty('workspaceName', 'Test WS');
      expect(result).toHaveProperty('messages');
      expect(result).toHaveProperty('autopilot');
      expect(result).toHaveProperty('queue');
    });
  });

  describe('runSmokeTest', () => {
    it('throws NotFoundException when workspace does not exist', async () => {
      prisma.workspace.findUnique.mockResolvedValue(null);
      await expect(service.runSmokeTest({ workspaceId: 'ws-missing' })).rejects.toThrow(NotFoundException);
    });
  });
});
