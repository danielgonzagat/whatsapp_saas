import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { AutopilotService } from './autopilot.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { InboxService } from '../inbox/inbox.service';
import { SmartTimeService } from '../analytics/smart-time/smart-time.service';

jest.mock('../queue/queue', () => ({
  autopilotQueue: { add: jest.fn() },
  flowQueue: { add: jest.fn() },
}));

jest.mock('../common/redis/redis.util', () => ({
  createRedisClient: jest.fn(() => ({})),
}));

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({ add: jest.fn() })),
}));

describe('AutopilotService', () => {
  let service: AutopilotService;

  const mockPrisma: any = {
    workspace: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    autopilotEvent: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  };

  const mockConfig = {
    get: jest.fn((key: string) => {
      const map: Record<string, any> = {
        OPENAI_API_KEY: null,
      };
      return map[key];
    }),
  };

  const mockInbox = {};
  const mockSmartTime = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AutopilotService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: InboxService, useValue: mockInbox },
        { provide: SmartTimeService, useValue: mockSmartTime },
      ],
    }).compile();

    service = module.get<AutopilotService>(AutopilotService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('getStatus() retorna enabled/billingSuspended', async () => {
    mockPrisma.workspace.findUnique.mockResolvedValue({
      providerSettings: { autopilot: { enabled: true }, billingSuspended: false },
    });

    const result = await service.getStatus('ws-1');

    expect(result).toEqual({
      workspaceId: 'ws-1',
      enabled: true,
      billingSuspended: false,
    });
  });

  it('toggleAutopilot() habilita e persiste em providerSettings.autopilot.enabled', async () => {
    mockPrisma.workspace.findUnique
      .mockResolvedValueOnce({ providerSettings: { billingSuspended: false } })
      .mockResolvedValueOnce({ providerSettings: {} });
    mockPrisma.workspace.update.mockResolvedValue({ id: 'ws-1' });

    const result = await service.toggleAutopilot('ws-1', true);

    expect(result).toEqual({ workspaceId: 'ws-1', enabled: true });
    expect(mockPrisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ws-1' },
        data: expect.objectContaining({ providerSettings: expect.any(Object) }),
      }),
    );
  });

  it('toggleAutopilot() falha se billingSuspended', async () => {
    mockPrisma.workspace.findUnique.mockResolvedValue({
      providerSettings: { billingSuspended: true },
    });

    await expect(service.toggleAutopilot('ws-1', true)).rejects.toThrow(
      /Autopilot suspenso/i,
    );
  });
});
