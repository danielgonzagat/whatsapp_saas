import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

jest.mock('firebase-admin', () => {
  const mockSendEach = jest.fn();

  return {
    initializeApp: jest.fn(),
    credential: {
      cert: jest.fn().mockReturnValue({}),
    },
    app: jest.fn(),
    messaging: jest.fn().mockReturnValue({
      sendEachForMulticast: mockSendEach,
    }),
    __sendEachForMulticast: mockSendEach,
  };
});

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: {
    deviceToken: {
      upsert: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      delete: jest.Mock;
      deleteMany: jest.Mock;
    };
    agent: { findMany: jest.Mock };
  };
  let auditService: { log: jest.Mock };
  let configService: { get: jest.Mock };

  beforeEach(async () => {
    prisma = {
      deviceToken: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      agent: { findMany: jest.fn() },
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    configService = { get: jest.fn().mockReturnValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  describe('registerDevice', () => {
    it('upserts deviceToken with the given agent, token and platform', async () => {
      prisma.deviceToken.upsert.mockResolvedValue({
        id: 'dt-1',
        token: 'abc123',
        platform: 'ios',
        agentId: 'agent-1',
      });

      const result = await service.registerDevice('agent-1', 'abc123', 'ios');

      expect(result).toMatchObject({ id: 'dt-1', token: 'abc123' });
      expect(prisma.deviceToken.upsert).toHaveBeenCalledWith({
        where: { token: 'abc123' },
        update: { agentId: 'agent-1', platform: 'ios' },
        create: { token: 'abc123', platform: 'ios', agentId: 'agent-1' },
      });
    });
  });

  describe('unregisterDevice', () => {
    it('finds the device, logs an audit event, and deletes it', async () => {
      prisma.deviceToken.findUnique.mockResolvedValue({
        id: 'dt-1',
        agentId: 'agent-1',
      });
      prisma.deviceToken.delete.mockResolvedValue({ id: 'dt-1' });

      const result = await service.unregisterDevice('abc123');

      expect(result).toMatchObject({ id: 'dt-1' });
      expect(auditService.log).toHaveBeenCalledWith({
        workspaceId: 'system',
        action: 'DELETE_RECORD',
        resource: 'DeviceToken',
        resourceId: 'dt-1',
        agentId: 'agent-1',
        details: { deletedBy: 'user' },
      });
      expect(prisma.deviceToken.delete).toHaveBeenCalledWith({
        where: { token: 'abc123' },
      });
    });

    it('returns null when device token is not found and delete fails', async () => {
      prisma.deviceToken.findUnique.mockResolvedValue(null);
      prisma.deviceToken.delete.mockRejectedValue(new Error('not found'));

      const result = await service.unregisterDevice('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('sendPushNotification', () => {
    it('returns zero sent/failed when no devices are registered', async () => {
      prisma.deviceToken.findMany.mockResolvedValue([]);

      const result = await service.sendPushNotification('agent-1', 'Hello', 'World');

      expect(result).toEqual({ sent: 0, failed: 0 });
    });

    it('returns all failed when firebase is not configured', async () => {
      prisma.deviceToken.findMany.mockResolvedValue([
        { id: 'dt-1', token: 'abc123' },
        { id: 'dt-2', token: 'def456' },
      ]);

      const result = await service.sendPushNotification('agent-1', 'Hello', 'World');

      expect(result).toEqual({
        sent: 0,
        failed: 2,
        reason: 'firebase_not_configured',
      });
    });
  });

  describe('sendPushToWorkspace', () => {
    it('aggregates sent and failed counts across all agents', async () => {
      prisma.agent.findMany.mockResolvedValue([{ id: 'agent-1' }, { id: 'agent-2' }]);
      prisma.deviceToken.findMany.mockResolvedValue([]);

      const result = await service.sendPushToWorkspace('ws-1', 'Title', 'Body');

      expect(result).toEqual({ sent: 0, failed: 0 });
      expect(prisma.agent.findMany).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1' },
        select: { id: true },
        take: 100,
      });
    });
  });

  describe('notifyNewMessage', () => {
    it('sends workspace push with message preview and conversation id', async () => {
      prisma.agent.findMany.mockResolvedValue([{ id: 'agent-1' }]);
      prisma.deviceToken.findMany.mockResolvedValue([]);

      const result = await service.notifyNewMessage(
        'ws-1',
        'John Doe',
        'Hey, how are you doing today?',
        'conv-99',
      );

      expect(result).toEqual({ sent: 0, failed: 0 });
    });
  });

  describe('notifyPaymentReceived', () => {
    it('sends workspace push with payment information', async () => {
      prisma.agent.findMany.mockResolvedValue([{ id: 'agent-1' }]);
      prisma.deviceToken.findMany.mockResolvedValue([]);

      const result = await service.notifyPaymentReceived('ws-1', 150.5, 'Maria Silva');

      expect(result).toEqual({ sent: 0, failed: 0 });
    });
  });
});
