import { Test, TestingModule } from '@nestjs/testing';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { INBOX_SERVICE } from '../inbox/inbox.token';
import { OpsAlertService } from '../observability/ops-alert.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../workspaces/workspace.service';
import { WhatsAppProviderRegistry } from './providers/provider-registry';
import { WorkerRuntimeService } from './worker-runtime.service';
import { WhatsappSessionService } from './whatsapp-session.service';
import { WhatsappMessageDispatcherService } from './whatsapp-message-dispatcher.service';

jest.mock('../queue/queue', () => ({
  flowQueue: {
    add: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue(undefined),
  },
  autopilotQueue: { add: jest.fn().mockResolvedValue(undefined) },
}));

const mockFlowQueueAdd = jest.requireMock<{
  flowQueue: { add: jest.Mock<(...args: unknown[]) => Promise<unknown>> };
}>('../queue/queue').flowQueue.add;

function getFlowQueueAddMock(): jest.Mock<(...args: unknown[]) => Promise<unknown>> {
  return mockFlowQueueAdd;
}

describe('WhatsappMessageDispatcherService', () => {
  let service: WhatsappMessageDispatcherService;
  let planLimits: {
    ensureSubscriptionActive: jest.Mock;
    ensureMessageRate: jest.Mock;
    ensureDailyMessageQuota: jest.Mock;
    trackMessageSend: jest.Mock;
  };
  let workspaces: { getWorkspace: jest.Mock; toEngineWorkspace: jest.Mock };
  let prisma: { contact: { findUnique: jest.Mock }; message: { findFirst: jest.Mock } };
  let providerRegistry: {
    sendMessage: jest.Mock;
    sendTemplate: jest.Mock;
    getSessionStatus: jest.Mock;
    setPresence: jest.Mock;
    sendTyping: jest.Mock;
    stopTyping: jest.Mock;
    readChatMessages: jest.Mock;
    getChats: jest.Mock;
    extractPhoneFromChatId: jest.Mock;
    deleteSession: jest.Mock;
  };
  let inbox: { saveMessageByPhone: jest.Mock };
  let workerRuntime: { isAvailable: jest.Mock };
  let sessionService: {
    validateWorkspaceProvider: jest.Mock;
    collectMessagingRuntimeIssues: jest.Mock;
    markChatAsReadBestEffort: jest.Mock;
  };
  let redis: { get: jest.Mock; set: jest.Mock; del: jest.Mock };

  beforeEach(async () => {
    planLimits = {
      ensureSubscriptionActive: jest.fn().mockResolvedValue(undefined),
      ensureMessageRate: jest.fn().mockResolvedValue(undefined),
      ensureDailyMessageQuota: jest.fn().mockResolvedValue(undefined),
      trackMessageSend: jest.fn().mockResolvedValue(undefined),
    };
    workspaces = {
      getWorkspace: jest.fn().mockResolvedValue({ id: 'ws-1', name: 'Test', providerSettings: {} }),
      toEngineWorkspace: jest.fn().mockReturnValue({ whatsappProvider: 'meta-cloud' }),
    };
    prisma = {
      contact: { findUnique: jest.fn().mockResolvedValue({ id: 'c-1', optIn: true, tags: [] }) },
      message: { findFirst: jest.fn().mockResolvedValue({ createdAt: new Date() }) },
    };
    providerRegistry = {
      sendMessage: jest.fn().mockResolvedValue({ success: true, messageId: 'wa-msg-1' }),
      sendTemplate: jest.fn(),
      getSessionStatus: jest.fn(),
      setPresence: jest.fn().mockResolvedValue(undefined),
      sendTyping: jest.fn().mockResolvedValue(undefined),
      stopTyping: jest.fn().mockResolvedValue(undefined),
      readChatMessages: jest.fn().mockResolvedValue(undefined),
      getChats: jest.fn(),
      extractPhoneFromChatId: jest.fn().mockReturnValue('5511999991234'),
      deleteSession: jest.fn(),
    };
    inbox = { saveMessageByPhone: jest.fn().mockResolvedValue({ id: 'msg-1', contactId: 'c-1' }) };
    workerRuntime = { isAvailable: jest.fn().mockResolvedValue(true) };
    sessionService = {
      validateWorkspaceProvider: jest.fn().mockReturnValue([]),
      collectMessagingRuntimeIssues: jest.fn().mockResolvedValue({ issues: [], diagnostics: {} }),
      markChatAsReadBestEffort: jest.fn().mockResolvedValue(undefined),
    };
    redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappMessageDispatcherService,
        { provide: PlanLimitsService, useValue: planLimits },
        { provide: WorkspaceService, useValue: workspaces },
        { provide: PrismaService, useValue: prisma },
        { provide: WhatsAppProviderRegistry, useValue: providerRegistry },
        { provide: INBOX_SERVICE, useValue: inbox },
        { provide: WorkerRuntimeService, useValue: workerRuntime },
        { provide: WhatsappSessionService, useValue: sessionService },
        { provide: 'default_IORedisModuleConnectionToken', useValue: redis },
        { provide: OpsAlertService, useValue: { alertOnCriticalError: jest.fn() } },
      ],
    }).compile();
    service = module.get(WhatsappMessageDispatcherService);
  });

  describe('sendMessage', () => {
    it('checks subscription is active', async () => {
      await service.sendMessage('ws-1', '5511999991234', 'hello');
      expect(planLimits.ensureSubscriptionActive).toHaveBeenCalledWith('ws-1');
    });

    it('queues message when worker is available', async () => {
      const result = await service.sendMessage('ws-1', '5511999991234', 'hello');
      expect(getFlowQueueAddMock()).toHaveBeenCalledWith(
        'send-message',
        expect.objectContaining({ to: '5511999991234', message: 'hello' }),
        expect.anything(),
      );
      expect(result).toEqual({ ok: true, queued: true, delivery: 'queued' });
    });

    it('falls back to direct send when worker is not available', async () => {
      workerRuntime.isAvailable.mockResolvedValue(false);
      const result = await service.sendMessage('ws-1', '5511999991234', 'hello', {
        forceDirect: false,
      });
      expect(providerRegistry.sendMessage).toHaveBeenCalled();
      expect(result).toEqual(expect.objectContaining({ ok: true, direct: true, delivery: 'sent' }));
    });

    it('returns error when provider config is incomplete', async () => {
      sessionService.validateWorkspaceProvider.mockReturnValue(['whatsapp_provider']);
      const result = await service.sendMessage('ws-1', '5511999991234', 'hello');
      expect(result.error).toBe(true);
    });

    it('returns error when runtime has issues', async () => {
      sessionService.collectMessagingRuntimeIssues.mockResolvedValue({
        issues: ['session_disconnected'],
        diagnostics: {},
      });
      const result = await service.sendMessage('ws-1', '5511999991234', 'hello');
      expect(result.error).toBe(true);
      expect(result.message).toContain('Runtime do WhatsApp indisponível');
    });
  });

  describe('sendTemplate', () => {
    it('queues template message successfully', async () => {
      const result = await service.sendTemplate('ws-1', '5511999991234', {
        name: 'hello_world',
        language: 'pt_BR',
      });
      expect(getFlowQueueAddMock()).toHaveBeenCalledWith(
        'send-message',
        expect.objectContaining({ type: 'template' }),
        expect.anything(),
      );
      expect(result).toEqual({ ok: true, queued: true, delivery: 'queued' });
    });

    it('tracks message send', async () => {
      await service.sendTemplate('ws-1', '5511999991234', { name: 'test', language: 'en' });
      expect(planLimits.trackMessageSend).toHaveBeenCalledWith('ws-1');
    });
  });

  describe('sendDirectMessage', () => {
    it('returns success when provider sends ok', async () => {
      const result = await service.sendDirectMessage('ws-1', '5511999991234', 'hello');

      expect(result).toEqual({
        success: true,
        result: {
          ok: true,
          direct: true,
          delivery: 'sent',
          messageId: 'wa-msg-1',
        },
      });
    });

    it('returns error when provider fails', async () => {
      providerRegistry.sendMessage.mockResolvedValue({ success: false, error: 'send blocked' });
      const result = await service.sendDirectMessage('ws-1', '5511999991234', 'hello');
      expect(result).toEqual({ error: true, message: 'send blocked' });
    });
  });

  describe('listTemplates', () => {
    it('returns error for legacy template support', () => {
      const result = service.listTemplates('ws-1');
      expect(result.error).toBe(true);
      expect(result.message).toContain('Templates legados');
    });
  });
});
