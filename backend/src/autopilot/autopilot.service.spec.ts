import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { AutopilotService } from './autopilot.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { InboxService } from '../inbox/inbox.service';
import { SmartTimeService } from '../analytics/smart-time/smart-time.service';

const mockQueueAdd: any = jest.fn();
let mockAutopilotAdd: any;
let mockFlowAdd: any;
let mockRedisSet: any;
let mockRedisGet: any;
let mockQueueGetJobCounts: any;

jest.mock('../queue/queue', () => ({
  autopilotQueue: { add: jest.fn(), getJobCounts: jest.fn() },
  flowQueue: { add: jest.fn() },
}));

jest.mock('../common/redis/redis.util', () => ({
  createRedisClient: jest.fn(() => ({
    set: jest.fn(),
    get: jest.fn(),
  })),
}));

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({ add: mockQueueAdd })),
}));

describe('AutopilotService', () => {
  let service: AutopilotService;

  const mockPrisma: any = {
    workspace: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    conversation: {
      findMany: jest.fn(),
    },
    campaign: {
      create: jest.fn(),
      update: jest.fn(),
    },
    contact: {
      upsert: jest.fn(),
    },
    message: {
      count: jest.fn(),
      findFirst: jest.fn(),
    },
    subscription: {
      findUnique: jest.fn(),
    },
    autopilotEvent: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
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
    const queueModule = jest.requireMock('../queue/queue') as any;
    const redisModule = jest.requireMock('../common/redis/redis.util') as any;
    mockAutopilotAdd = queueModule.autopilotQueue.add;
    mockQueueGetJobCounts = queueModule.autopilotQueue.getJobCounts;
    mockFlowAdd = queueModule.flowQueue.add;

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
    const redisClient =
      redisModule.createRedisClient.mock.results[
        redisModule.createRedisClient.mock.results.length - 1
      ]?.value || {};
    mockRedisSet = redisClient.set;
    mockRedisGet = redisClient.get;
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.ENABLE_LEGACY_BACKEND_AUTOPILOT;
  });

  it('getStatus() retorna enabled/billingSuspended', async () => {
    mockPrisma.workspace.findUnique.mockResolvedValue({
      providerSettings: {
        autopilot: { enabled: true },
        billingSuspended: false,
      },
    });

    const result = await service.getStatus('ws-1');

    expect(result).toEqual({
      workspaceId: 'ws-1',
      enabled: true,
      billingSuspended: false,
      autonomy: null,
    });
  });

  it('toggleAutopilot() habilita e persiste em providerSettings.autopilot.enabled', async () => {
    mockPrisma.workspace.findUnique.mockResolvedValue({
      providerSettings: {
        billingSuspended: false,
        whatsappProvider: 'whatsapp-api',
        whatsappApiSession: { status: 'connected' },
      },
    });
    mockPrisma.subscription.findUnique.mockResolvedValue(null);
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
    mockPrisma.subscription.findUnique.mockResolvedValue(null);

    await expect(service.toggleAutopilot('ws-1', true)).rejects.toThrow(
      /Autopilot suspenso/i,
    );
  });

  it('toggleAutopilot() falha se WhatsApp não estiver conectado', async () => {
    mockPrisma.workspace.findUnique.mockResolvedValue({
      providerSettings: {
        billingSuspended: false,
        whatsappProvider: 'whatsapp-api',
        whatsappApiSession: { status: 'disconnected' },
      },
    });
    mockPrisma.subscription.findUnique.mockResolvedValue(null);

    await expect(service.toggleAutopilot('ws-1', true)).rejects.toThrow(
      /Conecte\/configure o WhatsApp/i,
    );
  });

  it('toggleAutopilot() falha se assinatura estiver PAST_DUE/CANCELED', async () => {
    mockPrisma.workspace.findUnique.mockResolvedValue({
      providerSettings: {
        billingSuspended: false,
        whatsappProvider: 'whatsapp-api',
        whatsappApiSession: { status: 'connected' },
      },
    });
    mockPrisma.subscription.findUnique.mockResolvedValue({
      status: 'PAST_DUE',
    });

    await expect(service.toggleAutopilot('ws-1', true)).rejects.toThrow(
      /Assinatura PAST_DUE/i,
    );
  });

  it('getPipelineStatus() retorna snapshot do pipeline com fila e contadores', async () => {
    mockPrisma.workspace.findUnique.mockResolvedValue({
      id: 'ws-1',
      name: 'Branding Caps',
      providerSettings: {
        autopilot: { enabled: true },
        whatsappApiSession: { status: 'connected' },
      },
    });
    mockPrisma.message.count
      .mockResolvedValueOnce(18)
      .mockResolvedValueOnce(12);
    mockPrisma.autopilotEvent.count
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2);
    mockPrisma.message.findFirst
      .mockResolvedValueOnce({
        id: 'in-1',
        content: 'Oi',
        createdAt: new Date('2026-03-19T10:00:00.000Z'),
        contactId: 'c-1',
      })
      .mockResolvedValueOnce({
        id: 'out-1',
        content: 'Olá',
        createdAt: new Date('2026-03-19T10:01:00.000Z'),
        contactId: 'c-1',
      });
    mockPrisma.autopilotEvent.findFirst.mockResolvedValue({
      action: 'AUTONOMOUS_FALLBACK',
      status: 'executed',
    });
    mockPrisma.autopilotEvent.findMany.mockResolvedValue([
      { action: 'SEND_OFFER', status: 'error', reason: 'waha_down' },
    ]);
    mockQueueGetJobCounts.mockResolvedValue({
      waiting: 2,
      active: 1,
      delayed: 0,
      failed: 1,
    });

    const result = await service.getPipelineStatus('ws-1');

    expect(result).toEqual(
      expect.objectContaining({
        workspaceId: 'ws-1',
        workspaceName: 'Branding Caps',
        messages: expect.objectContaining({
          received: 18,
          responded: 12,
          unansweredEstimate: 6,
        }),
        autopilot: expect.objectContaining({
          executed: 10,
          skipped: 3,
          failed: 2,
        }),
        queue: expect.objectContaining({
          waiting: 2,
          active: 1,
          failed: 1,
        }),
      }),
    );
  });

  it('runSmokeTest() enfileira scan-contact e retorna o resultado consumido do redis', async () => {
    mockPrisma.workspace.findUnique.mockResolvedValue({
      id: 'ws-1',
      name: 'Branding Caps',
      providerSettings: {
        autopilot: { enabled: true },
        whatsappApiSession: { status: 'connected' },
      },
    });
    mockPrisma.contact.upsert.mockResolvedValue({ id: 'contact-1' });
    mockRedisSet.mockResolvedValue('OK');
    mockRedisGet
      .mockResolvedValueOnce(
        JSON.stringify({
          smokeTestId: 'pending',
          status: 'queued',
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          smokeTestId: 'done',
          status: 'completed',
          responseText: 'Sou o Kloel e posso ajudar com PDRN.',
        }),
      );
    mockAutopilotAdd.mockResolvedValue(undefined);
    mockQueueGetJobCounts.mockResolvedValue({
      waiting: 0,
      active: 0,
      delayed: 0,
      failed: 0,
    });

    const result = await service.runSmokeTest({
      workspaceId: 'ws-1',
      phone: '5511999999999',
      message: 'Quero saber sobre PDRN',
      waitMs: 2500,
    });

    expect(mockAutopilotAdd).toHaveBeenCalledWith(
      'scan-contact',
      expect.objectContaining({
        workspaceId: 'ws-1',
        contactId: 'contact-1',
        phone: '5511999999999',
        smokeMode: 'dry-run',
      }),
      expect.objectContaining({
        removeOnComplete: true,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        workspaceId: 'ws-1',
        queued: true,
        mode: 'dry-run',
        phone: '5511999999999',
        result: expect.objectContaining({
          status: 'completed',
          responseText: 'Sou o Kloel e posso ajudar com PDRN.',
        }),
      }),
    );
  });

  it('runAutopilotCycle() stays disabled by default so the worker remains the single autonomy motor', async () => {
    const result = await service.runAutopilotCycle('ws-legacy-off');

    expect(result).toEqual({
      status: 'disabled',
      reason: 'legacy_backend_autopilot_disabled',
    });
    expect(mockPrisma.conversation.findMany).not.toHaveBeenCalled();
  });

  it('moneyMachine() stays disabled by default to avoid duplicate proactive sends', async () => {
    const result = await service.moneyMachine('ws-legacy-off');

    expect(result).toEqual({
      created: [],
      segments: {
        hot: 0,
        warm: 0,
        cold: 0,
      },
      autoSend: false,
      scheduledAt: null,
      status: 'disabled',
      reason: 'legacy_backend_autopilot_disabled',
    });
    expect(mockPrisma.campaign.create).not.toHaveBeenCalled();
  });
});
