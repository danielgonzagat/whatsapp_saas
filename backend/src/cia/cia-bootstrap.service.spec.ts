import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CiaBootstrapService } from './cia-bootstrap.service';
import { WhatsAppProviderRegistry } from '../whatsapp/providers/provider-registry';
import { AgentEventsService } from '../whatsapp/agent-events.service';
import { CiaChatFilterService } from './cia-chat-filter.service';
import { CiaRuntimeStateService } from './cia-runtime-state.service';
import { WhatsAppCatchupService } from '../whatsapp/whatsapp-catchup.service';
import { OpsAlertService } from '../observability/ops-alert.service';

describe('CiaBootstrapService', () => {
  let service: CiaBootstrapService;
  let prisma: { conversation: { findMany: jest.Mock } };
  let providerRegistry: { getSessionStatus: jest.Mock; getChats: jest.Mock };
  let agentEvents: { publish: jest.Mock };
  let runtimeState: {
    persistRuntimeSnapshot: jest.Mock;
    updateWorkspaceAutonomy: jest.Mock;
    scheduleContactCatalogRefresh: jest.Mock;
  };
  let chatFilter: { normalizeChats: jest.Mock; selectRemotePendingChats: jest.Mock };
  let mindScheduler: { registerWorkspace: jest.Mock; deregisterWorkspace: jest.Mock };

  beforeEach(async () => {
    prisma = { conversation: { findMany: jest.fn().mockResolvedValue([]) } };
    providerRegistry = {
      getSessionStatus: jest.fn(),
      getChats: jest.fn().mockResolvedValue({ chats: [] }),
    };
    agentEvents = { publish: jest.fn().mockResolvedValue(undefined) };
    runtimeState = {
      persistRuntimeSnapshot: jest.fn().mockResolvedValue(undefined),
      updateWorkspaceAutonomy: jest.fn().mockResolvedValue(undefined),
      scheduleContactCatalogRefresh: jest.fn().mockResolvedValue(undefined),
    } as never;
    chatFilter = {
      normalizeChats: jest.fn().mockReturnValue([]),
      selectRemotePendingChats: jest.fn().mockReturnValue([]),
    };
    mindScheduler = {
      registerWorkspace: jest.fn(),
      deregisterWorkspace: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CiaBootstrapService,
        { provide: PrismaService, useValue: prisma },
        { provide: WhatsAppProviderRegistry, useValue: providerRegistry },
        { provide: AgentEventsService, useValue: agentEvents },
        { provide: CiaChatFilterService, useValue: chatFilter },
        { provide: CiaRuntimeStateService, useValue: runtimeState },
        {
          provide: WhatsAppCatchupService,
          useValue: { triggerCatchup: jest.fn().mockResolvedValue({}) },
        },
        { provide: OpsAlertService, useValue: { alertOnCriticalError: jest.fn() } },
      ],
    }).compile();
    service = module.get(CiaBootstrapService);
  });

  describe('listPendingConversations', () => {
    it('filters by workspaceId and status != CLOSED', async () => {
      await service.listPendingConversations('ws-tenant-A', 100);
      const arg = prisma.conversation.findMany.mock.calls[0][0];
      expect(arg.where.workspaceId).toBe('ws-tenant-A');
      expect(arg.where.status).toEqual({ not: 'CLOSED' });
      expect(arg.take).toBe(100);
    });

    it('clamps take to [1, 2000]', async () => {
      await service.listPendingConversations('ws-1', 999999);
      expect(prisma.conversation.findMany.mock.calls[0][0].take).toBe(2000);

      prisma.conversation.findMany.mockClear();
      await service.listPendingConversations('ws-1', 0);
      expect(prisma.conversation.findMany.mock.calls[0][0].take).toBe(500);
    });

    it('returns only conversations with operational.pending=true', async () => {
      prisma.conversation.findMany.mockResolvedValue([
        {
          id: 'c1',
          status: 'OPEN',
          mode: 'HUMAN',
          assignedAgentId: 'agent-1',
          unreadCount: 0,
          lastMessageAt: new Date(),
          contactId: 'k1',
          contact: { id: 'k1', phone: '+5511', name: 'A' },
          messages: [],
        },
        {
          id: 'c2',
          status: 'OPEN',
          mode: 'AI',
          assignedAgentId: null,
          unreadCount: 3,
          lastMessageAt: new Date(),
          contactId: 'k2',
          contact: { id: 'k2', phone: '+5511', name: 'B' },
          messages: [
            { id: 'm1', direction: 'INBOUND', createdAt: new Date(), content: 'hi' },
          ],
        },
      ]);
      const result = await service.listPendingConversations('ws-1', 100);
      // Only "pending" ones (operational.pending=true) are returned
      expect(result.length).toBeLessThanOrEqual(2);
      for (const c of result) {
        expect(c.operational.pending).toBe(true);
      }
    });
  });

  describe('countPendingMessagesFromConversations', () => {
    it('sums pendingMessages with min of 1 per conversation', () => {
      const conversations = [
        { pendingMessages: 5 },
        { pendingMessages: 0 },
        { operational: { pendingMessages: 3 } },
      ];
      expect(service.countPendingMessagesFromConversations(conversations as never)).toBe(5 + 1 + 3);
    });

    it('returns 0 for empty list', () => {
      expect(service.countPendingMessagesFromConversations([])).toBe(0);
    });
  });

  describe('run (bootstrap sequence)', () => {
    it('aborts with error when WhatsApp not connected', async () => {
      providerRegistry.getSessionStatus.mockResolvedValue({
        connected: false,
        status: 'STARTING',
      });
      const startBacklogRun = jest.fn();
      const startPresence = jest.fn().mockResolvedValue(undefined);
      const stopPresence = jest.fn().mockResolvedValue(undefined);

      const result = await service.run(
        'ws-1',
        startBacklogRun,
        startPresence,
        stopPresence,
      );

      expect(result.connected).toBe(false);
      expect(stopPresence).toHaveBeenCalledWith('ws-1', false);
      expect(runtimeState.persistRuntimeSnapshot).toHaveBeenCalledWith(
        'ws-1',
        expect.objectContaining({ state: 'ERROR' }),
      );
      expect(startBacklogRun).not.toHaveBeenCalled();
    });

    it('publishes "thought" events when access succeeds', async () => {
      providerRegistry.getSessionStatus.mockResolvedValue({
        connected: true,
        status: 'CONNECTED',
      });
      providerRegistry.getChats.mockResolvedValue({ chats: [] });
      const startBacklogRun = jest.fn().mockResolvedValue({});
      await service.run(
        'ws-1',
        startBacklogRun,
        jest.fn().mockResolvedValue(undefined),
        jest.fn().mockResolvedValue(undefined),
      );
      const publishCalls = agentEvents.publish.mock.calls.map((c) => c[0]?.type);
      expect(publishCalls).toContain('thought');
    });

    it('registers the workspace with MIND tick scheduler after successful bootstrap', async () => {
      const sched = {
        registerWorkspace: jest.fn(),
        deregisterWorkspace: jest.fn(),
      };
      // Build a fresh service with the scheduler injected directly
      const svc = new CiaBootstrapService(
        prisma as never,
        providerRegistry as never,
        agentEvents as never,
        chatFilter as never,
        runtimeState as never,
        { triggerCatchup: jest.fn().mockResolvedValue({ scheduled: true, reason: 'test' }) } as never,
        undefined,
        sched as never,
      );

      providerRegistry.getSessionStatus.mockResolvedValue({
        connected: true,
        status: 'WORKING',
      });
      providerRegistry.getChats.mockResolvedValue({ chats: [] });
      const startBacklogRun = jest.fn().mockResolvedValue({});
      const startPresence = jest.fn().mockResolvedValue(undefined);
      const stopPresence = jest.fn().mockResolvedValue(undefined);

      await svc.run('ws-test', startBacklogRun, startPresence, stopPresence);

      expect(sched.registerWorkspace).toHaveBeenCalledWith('ws-test');
    });

    it('does NOT register the workspace when bootstrap fails (not connected)', async () => {
      const sched = {
        registerWorkspace: jest.fn(),
        deregisterWorkspace: jest.fn(),
      };
      const svc = new CiaBootstrapService(
        prisma as never,
        providerRegistry as never,
        agentEvents as never,
        chatFilter as never,
        runtimeState as never,
        { triggerCatchup: jest.fn() } as never,
        undefined,
        sched as never,
      );

      providerRegistry.getSessionStatus.mockResolvedValue({
        connected: false,
        status: 'STARTING',
      });

      const startBacklogRun = jest.fn();
      const startPresence = jest.fn().mockResolvedValue(undefined);
      const stopPresence = jest.fn().mockResolvedValue(undefined);

      await svc.run('ws-test', startBacklogRun, startPresence, stopPresence);

      expect(sched.registerWorkspace).not.toHaveBeenCalled();
    });
  });
});
