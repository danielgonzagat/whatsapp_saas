import { CiaBootstrapService } from '../cia/cia-bootstrap.service';
import { CiaChatFilterService } from '../cia/cia-chat-filter.service';
import type {
  PrismaMock,
  ProviderRegistryMock,
  CatchupServiceMock,
  AgentEventsMock,
} from './cia-runtime.fixtures';
import type { CiaRuntimeStateMock } from './cia-runtime.service.fixtures';

type CiaBootstrapOverrides = {
  prisma: PrismaMock;
  providerRegistry: ProviderRegistryMock;
  agentEvents: AgentEventsMock;
  chatFilter: CiaChatFilterService;
  runtimeState: CiaRuntimeStateMock;
  catchupService: CatchupServiceMock;
};

function buildService(deps: CiaBootstrapOverrides): CiaBootstrapService {
  return new CiaBootstrapService(
    deps.prisma as never,
    deps.providerRegistry as never,
    deps.agentEvents as never,
    deps.chatFilter,
    deps.runtimeState,
    deps.catchupService as never,
  );
}

describe('CiaBootstrapService', () => {
  let prisma: PrismaMock;
  let providerRegistry: ProviderRegistryMock;
  let agentEvents: AgentEventsMock;
  let chatFilter: CiaChatFilterService;
  let runtimeState: CiaRuntimeStateMock;
  let catchupService: CatchupServiceMock;
  let service: CiaBootstrapService;

  beforeEach(() => {
    const txnCallback = jest.fn().mockImplementation((callback: () => unknown) => callback());
    prisma = {
      $transaction: txnCallback,
      workspace: {
        findUnique: jest.fn().mockResolvedValue({
          providerSettings: {
            autopilot: { enabled: false },
            autonomy: { autoBootstrapOnConnected: true },
            ciaRuntime: {},
          },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      conversation: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      contact: { findUnique: jest.fn(), findFirst: jest.fn() },
      message: { findFirst: jest.fn(), findMany: jest.fn() },
      kloelMemory: { findUnique: jest.fn(), findMany: jest.fn() },
      systemInsight: { findMany: jest.fn() },
    };

    providerRegistry = {
      getSessionStatus: jest.fn().mockResolvedValue({ connected: true, status: 'CONNECTED' }),
      getChats: jest.fn().mockResolvedValue([]),
      getChatMessages: jest.fn(),
      setPresence: jest.fn(),
    };

    agentEvents = { publish: jest.fn().mockResolvedValue(undefined) };

    chatFilter = new CiaChatFilterService();

    runtimeState = {
      createAutonomyRun: jest.fn(),
      updateWorkspaceAutonomy: jest.fn().mockResolvedValue(undefined),
      updateAutonomyRunStatus: jest.fn(),
      persistRuntimeSnapshot: jest.fn(),
      finalizeSilentLiveMode: jest.fn(),
      scheduleContactCatalogRefresh: jest.fn().mockResolvedValue({ scheduled: true }),
      resetStaleRuntimeRunIfNeeded: jest.fn(),
      getOperationalIntelligence: jest.fn(),
      finalizeRun: jest.fn(),
    } as CiaRuntimeStateMock;

    catchupService = {
      triggerCatchup: jest.fn().mockResolvedValue({ scheduled: true }),
      runCatchupNow: jest.fn().mockResolvedValue({ scheduled: true }),
    };

    service = buildService({
      prisma,
      providerRegistry,
      agentEvents,
      chatFilter,
      runtimeState,
      catchupService,
    });
  });

  describe('listPendingConversations', () => {
    it('queries non-CLOSED conversations for the workspace and filters by pending state', async () => {
      prisma.conversation.findMany.mockResolvedValue([
        {
          id: 'conv-1',
          status: 'OPEN',
          mode: 'AI',
          assignedAgentId: null,
          unreadCount: 5,
          lastMessageAt: new Date(),
          contactId: 'contact-1',
          contact: { id: 'contact-1', phone: '5511999991111', name: 'Alice' },
          messages: [{ id: 'm1', direction: 'INBOUND', createdAt: new Date(), content: 'Oi' }],
        },
      ]);

      const conversations = await service.listPendingConversations('ws-a', 100);

      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workspaceId: 'ws-a',
            status: { not: 'CLOSED' },
          }),
        }),
      );
      expect(conversations).toHaveLength(1);
    });

    it('clamps the limit between 1 and 2000', async () => {
      await service.listPendingConversations('ws-a', 0);
      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: expect.any(Number) }),
      );

      await service.listPendingConversations('ws-a', 5000);
      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 2000 }),
      );
    });

    it('filters out conversations that are not pending (already replied)', async () => {
      prisma.conversation.findMany.mockResolvedValue([
        {
          id: 'conv-2',
          status: 'OPEN',
          mode: 'AI',
          assignedAgentId: null,
          unreadCount: 0,
          lastMessageAt: new Date(),
          contactId: 'contact-2',
          contact: { id: 'contact-2', phone: '5511888888888', name: 'Bruno' },
          messages: [
            { id: 'm2', direction: 'OUTBOUND', createdAt: new Date(), content: 'Tudo certo' },
            {
              id: 'm1',
              direction: 'INBOUND',
              createdAt: new Date(Date.now() - 1000),
              content: 'Oi',
            },
          ],
        },
      ]);

      const conversations = await service.listPendingConversations('ws-a', 100);
      expect(conversations).toHaveLength(0);
    });

    it('enriches conversations with operational metadata', async () => {
      prisma.conversation.findMany.mockResolvedValue([
        {
          id: 'conv-1',
          status: 'OPEN',
          mode: 'AI',
          assignedAgentId: null,
          unreadCount: 2,
          lastMessageAt: new Date(),
          contactId: 'contact-1',
          contact: { id: 'contact-1', phone: '5511999991111', name: 'Alice' },
          messages: [
            { id: 'm1', direction: 'INBOUND', createdAt: new Date(), content: 'Preciso de ajuda' },
          ],
        },
      ]);

      const conversations = await service.listPendingConversations('ws-a', 100);
      expect(conversations[0]).toHaveProperty('operational');
      expect(conversations[0].operational).toHaveProperty('pending', true);
    });
  });

  describe('countPendingMessagesFromConversations', () => {
    it('sums pendingMessages across operational metadata', () => {
      const conversations = [
        { operational: { pendingMessages: 3 } },
        { operational: { pendingMessages: 5 } },
      ];

      const count = service.countPendingMessagesFromConversations(conversations);
      expect(count).toBe(8);
    });

    it('falls back to at least 1 per conversation when no operational metadata', () => {
      const conversations = [
        {},
        { operational: {} },
        { pendingMessages: 0, operational: { pendingMessages: 0 } },
      ];

      const count = service.countPendingMessagesFromConversations(conversations);
      expect(count).toBe(3);
    });
  });

  describe('run', () => {
    let startBacklogRun: jest.Mock;
    let startPresenceHeartbeat: jest.Mock;
    let stopPresenceHeartbeat: jest.Mock;

    beforeEach(() => {
      startBacklogRun = jest.fn().mockResolvedValue({ runId: 'run-1', totalQueued: 3 });
      startPresenceHeartbeat = jest.fn().mockResolvedValue(undefined);
      stopPresenceHeartbeat = jest.fn().mockResolvedValue(undefined);
    });

    it('refuses to bootstrap when WhatsApp is not connected', async () => {
      providerRegistry.getSessionStatus.mockResolvedValue({
        connected: false,
        status: 'SCAN_QR_CODE',
      });

      const result = await service.run(
        'ws-a',
        startBacklogRun,
        startPresenceHeartbeat,
        stopPresenceHeartbeat,
      );

      expect(result.connected).toBe(false);
      expect(result.pendingConversations).toBe(0);
      expect(agentEvents.publish).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', workspaceId: 'ws-a', phase: 'access' }),
      );
      expect(stopPresenceHeartbeat).toHaveBeenCalled();
    });

    it('bootstraps successfully when connected and publishes access events', async () => {
      const result = await service.run(
        'ws-a',
        startBacklogRun,
        startPresenceHeartbeat,
        stopPresenceHeartbeat,
      );

      expect(result.connected).toBe(true);
      expect(agentEvents.publish).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'thought', phase: 'access', workspaceId: 'ws-a' }),
      );
      expect(startPresenceHeartbeat).toHaveBeenCalledWith('ws-a');
    });

    it('starts an immediate backlog run when pending conversations exist', async () => {
      prisma.conversation.findMany.mockResolvedValue([
        {
          id: 'conv-1',
          status: 'OPEN',
          mode: 'AI',
          assignedAgentId: null,
          unreadCount: 3,
          lastMessageAt: new Date(),
          contactId: 'contact-1',
          contact: { id: 'contact-1', phone: '5511999991111', name: 'Alice' },
          messages: [{ id: 'm1', direction: 'INBOUND', createdAt: new Date(), content: 'Oi' }],
        },
      ]);

      await service.run('ws-a', startBacklogRun, startPresenceHeartbeat, stopPresenceHeartbeat);

      expect(startBacklogRun).toHaveBeenCalledWith(
        'ws-a',
        'reply_all_recent_first',
        expect.any(Number),
        expect.objectContaining({ autoStarted: true, triggeredBy: 'autopilot_total' }),
      );
    });

    it('enters LIVE mode when no pending conversations exist', async () => {
      const result = await service.run(
        'ws-a',
        startBacklogRun,
        startPresenceHeartbeat,
        stopPresenceHeartbeat,
      );

      expect(result.pendingConversations).toBe(0);
      expect(runtimeState.updateWorkspaceAutonomy).toHaveBeenCalledWith(
        'ws-a',
        expect.objectContaining({
          mode: 'FULL',
          runtime: expect.objectContaining({ state: 'LIVE_READY' }),
        }),
      );
    });

    it('tenant isolaton: queries use the specific workspaceId passed to run', async () => {
      await service.run(
        'ws-tenant-a',
        startBacklogRun,
        startPresenceHeartbeat,
        stopPresenceHeartbeat,
      );

      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workspaceId: 'ws-tenant-a' }),
        }),
      );
    });

    it('handles sync failure gracefully and sets degraded mode', async () => {
      prisma.conversation.findMany.mockRejectedValue(new Error('DB timeout'));

      const result = await service.run(
        'ws-a',
        startBacklogRun,
        startPresenceHeartbeat,
        stopPresenceHeartbeat,
      );

      expect(result.connected).toBe(true);
      expect(agentEvents.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'status',
          phase: 'sync',
        }),
      );
    });
  });

  describe('resolveActiveSessionKey', () => {
    it('returns the workspaceId as fallback when no session name is configured', async () => {
      prisma.workspace.findUnique.mockResolvedValue({
        providerSettings: {},
      });

      const key = await service.resolveActiveSessionKey('ws-a');
      expect(key).toBe('ws-a');
    });

    it('returns the whatsappWebSession name when configured', async () => {
      prisma.workspace.findUnique.mockResolvedValue({
        providerSettings: {
          whatsappWebSession: { sessionName: 'custom-session' },
        },
      });

      const key = await service.resolveActiveSessionKey('ws-a');
      expect(key).toBe('custom-session');
    });

    it('falls back to workspaceId when getSessionStatus throws', async () => {
      providerRegistry.getSessionStatus.mockRejectedValue(new Error('WAHA unreachable'));

      const key = await service.resolveActiveSessionKey('ws-a');
      expect(key).toBe('ws-a');
    });

    it('falls back to workspaceId when getSessionStatus throws and no providerSettings configured', async () => {
      providerRegistry.getSessionStatus.mockRejectedValue(new Error('WAHA timeout'));
      prisma.workspace.findUnique.mockResolvedValue({
        providerSettings: {},
      });

      const key = await service.resolveActiveSessionKey('ws-b');
      expect(key).toBe('ws-b');
    });
  });
});
