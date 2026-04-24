import { CiaRuntimeStateService } from './cia-runtime-state.service';
import { CiaBootstrapService } from './cia-bootstrap.service';
import { CiaBacklogRunService } from './cia-backlog-run.service';
import { CiaChatFilterService } from './cia-chat-filter.service';

export type PrismaMock = {
  workspace: { findUnique: jest.Mock; update: jest.Mock };
  conversation: { findMany: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
  contact: { findUnique: jest.Mock; findFirst: jest.Mock };
  message: { findFirst: jest.Mock; findMany: jest.Mock };
  kloelMemory: { findUnique: jest.Mock; findMany: jest.Mock };
  systemInsight: { findMany: jest.Mock };
};

export type ProviderRegistryMock = {
  getSessionStatus: jest.Mock;
  getChats: jest.Mock;
  getChatMessages: jest.Mock;
  setPresence: jest.Mock;
};

export type CatchupServiceMock = {
  triggerCatchup: jest.Mock;
  runCatchupNow: jest.Mock;
};

export type AgentEventsMock = { publish: jest.Mock };
export type WorkerRuntimeMock = { isAvailable: jest.Mock };

export type RedisMock = {
  set: jest.Mock;
  del: jest.Mock;
  incr: jest.Mock;
  expire: jest.Mock;
  decr: jest.Mock;
};

export type WhatsappServiceMock = { sendMessage: jest.Mock };
export type UnifiedAgentMock = { processIncomingMessage: jest.Mock };

export type CiaRuntimeStateMock = CiaRuntimeStateService;
export type CiaBootstrapMock = CiaBootstrapService;
export type CiaBacklogRunMock = CiaBacklogRunService;

export function makePrismaMock(): PrismaMock {
  return {
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
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'conv-1',
          unreadCount: 5,
          status: 'OPEN',
          mode: 'AI',
          assignedAgentId: null,
          lastMessageAt: new Date(),
          contactId: 'contact-1',
          contact: { id: 'contact-1', name: 'Alice', phone: '5511999991111' },
          messages: [
            {
              id: 'conv-1-msg-1',
              direction: 'INBOUND',
              createdAt: new Date(),
              content: 'Quero saber o preço',
            },
          ],
        },
        {
          id: 'conv-2',
          unreadCount: 2,
          status: 'OPEN',
          mode: 'AI',
          assignedAgentId: null,
          lastMessageAt: new Date(Date.now() - 1_000),
          contactId: 'contact-2',
          contact: { id: 'contact-2', name: 'Bruno', phone: '5511888888888' },
          messages: [
            {
              id: 'conv-2-msg-1',
              direction: 'INBOUND',
              createdAt: new Date(Date.now() - 1_000),
              content: 'Tem composição?',
            },
          ],
        },
      ]),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    },
    contact: {
      findUnique: jest.fn().mockImplementation(({ where }: { where: { id?: string } }) => {
        if (where?.id === 'contact-1') return { id: 'contact-1', phone: '5511999991111' };
        if (where?.id === 'contact-2') return { id: 'contact-2', phone: '5511888888888' };
        return null;
      }),
      findFirst: jest
        .fn()
        .mockImplementation(
          ({ where }: { where: { phone?: string; contact?: { phone?: string } } }) => {
            const phone = where?.phone || where?.contact?.phone;
            if (phone === '5511999991111') return { id: 'contact-1', phone: '5511999991111' };
            if (phone === '5511888888888') return { id: 'contact-2', phone: '5511888888888' };
            return null;
          },
        ),
    },
    message: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockImplementation(({ where }: { where: { contactId?: string } }) => {
        if (where?.contactId === 'contact-1') {
          return [
            {
              content: 'Quero saber o preço',
              externalId: 'quoted-contact-1',
              createdAt: new Date().toISOString(),
            },
          ];
        }
        if (where?.contactId === 'contact-2') {
          return [
            {
              content: 'Tem composição?',
              externalId: 'quoted-contact-2',
              createdAt: new Date(Date.now() - 1_000).toISOString(),
            },
          ];
        }
        return [];
      }),
    },
    kloelMemory: {
      findUnique: jest.fn().mockResolvedValue({ value: { openBacklog: 12, hotLeadCount: 3 } }),
      findMany: jest
        .fn()
        .mockResolvedValue([{ value: { normalizedKey: 'price_resistance', frequency: 5 } }]),
    },
    systemInsight: {
      findMany: jest.fn().mockResolvedValue([{ id: 'insight-1', type: 'CIA_MARKET_SIGNAL' }]),
    },
  };
}

export function makeProviderRegistryMock(): ProviderRegistryMock {
  return {
    getSessionStatus: jest.fn().mockResolvedValue({ connected: true, status: 'WORKING' }),
    getChats: jest.fn().mockResolvedValue([
      { id: 'chat-1', unreadCount: 5, timestamp: Date.now() },
      { id: 'chat-2', unreadCount: 2, timestamp: Date.now() - 1000 },
      { id: 'chat-3', unreadCount: 0, timestamp: Date.now() - 2000 },
    ]),
    getChatMessages: jest.fn().mockResolvedValue([]),
    setPresence: jest.fn().mockResolvedValue(undefined),
  };
}

export function makeCatchupServiceMock(): CatchupServiceMock {
  return {
    triggerCatchup: jest.fn().mockResolvedValue({ scheduled: true, reason: 'cia_bootstrap' }),
    runCatchupNow: jest.fn().mockResolvedValue({
      scheduled: true,
      importedMessages: 0,
      touchedChats: 0,
      processedChats: 0,
      overflow: false,
    }),
  };
}

export function makeAgentEventsMock(): AgentEventsMock {
  return { publish: jest.fn().mockResolvedValue(undefined) };
}

export function makeWorkerRuntimeMock(): WorkerRuntimeMock {
  return { isAvailable: jest.fn().mockResolvedValue(true) };
}

export function makeRedisMock(): RedisMock {
  return {
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    decr: jest.fn().mockResolvedValue(0),
  };
}

export function makeWhatsappServiceMock(): WhatsappServiceMock {
  return {
    sendMessage: jest.fn().mockResolvedValue({ ok: true, delivery: 'sent', direct: true }),
  };
}

export function makeUnifiedAgentMock(): UnifiedAgentMock {
  return {
    processIncomingMessage: jest.fn().mockResolvedValue({
      reply: 'Resposta automática',
      response: 'Resposta automática',
      actions: [],
      intent: 'QUALIFY',
      confidence: 0.9,
    }),
  };
}

/**
 * Builds a real CiaRuntimeStateService instance from the provided mocks.
 * Only needs prisma + agentEvents — both are already available in the test fixtures.
 */
export function makeCiaRuntimeStateMock(
  prisma: PrismaMock,
  agentEvents: AgentEventsMock,
): CiaRuntimeStateMock {
  return new CiaRuntimeStateService(prisma as never, agentEvents as never);
}

/**
 * Builds a real CiaBootstrapService instance from the provided mocks.
 * CiaChatFilterService has no constructor — instantiated directly.
 */
export function makeCiaBootstrapMock(
  prisma: PrismaMock,
  providerRegistry: ProviderRegistryMock,
  agentEvents: AgentEventsMock,
  runtimeState: CiaRuntimeStateMock,
  catchupService: CatchupServiceMock,
): CiaBootstrapMock {
  const chatFilter = new CiaChatFilterService();
  return new CiaBootstrapService(
    prisma as never,
    providerRegistry as never,
    agentEvents as never,
    chatFilter as never,
    runtimeState as never,
    catchupService as never,
  );
}

/**
 * Builds a real CiaBacklogRunService instance from the provided mocks.
 * Deep deps (inlineFallback, remoteBacklog) are stubbed with jest mocks
 * since the tests only exercise the queue-based and inline-fallback paths
 * that flow through workerRuntime.isAvailable + unifiedAgent + whatsappService.
 */
export function makeCiaBacklogRunMock(
  prisma: PrismaMock,
  providerRegistry: ProviderRegistryMock,
  agentEvents: AgentEventsMock,
  runtimeState: CiaRuntimeStateMock,
  workerRuntime: WorkerRuntimeMock,
  bootstrapService: CiaBootstrapMock,
  catchupService: CatchupServiceMock,
  unifiedAgent: UnifiedAgentMock,
  whatsappService: WhatsappServiceMock,
  _redis: RedisMock,
): CiaBacklogRunMock {
  const chatFilter = new CiaChatFilterService();

  // Minimal inlineFallback stub: replicates the processInline behavior used in tests
  const inlineFallback = {
    buildPendingInboundBatch: jest
      .fn()
      .mockImplementation(({ contactId }: { workspaceId: string; contactId: string | null }) => {
        if (contactId === 'contact-1') {
          return Promise.resolve({ aggregatedMessage: 'Quero saber o preço', messages: [] });
        }
        if (contactId === 'contact-2') {
          return Promise.resolve({ aggregatedMessage: 'Tem composição?', messages: [] });
        }
        return Promise.resolve(null);
      }),
    runInlineForBatch: jest
      .fn()
      .mockImplementation(
        async (batch: Array<{ workspaceId: string; phone: string; conversationId: string }>) => {
          const processed: string[] = [];
          const skipped: string[] = [];
          for (const item of batch) {
            try {
              const reply = await unifiedAgent.processIncomingMessage(item as never);
              if (reply?.reply || reply?.response) {
                await whatsappService.sendMessage({
                  workspaceId: item.workspaceId,
                  phone: item.phone,
                  message: reply.reply || reply.response,
                } as never);
                processed.push(item.conversationId);
              } else {
                skipped.push(item.conversationId);
              }
            } catch {
              skipped.push(item.conversationId);
            }
          }
          return { processed, skipped };
        },
      ),
    runBacklogInlineFallback: jest.fn().mockImplementation(
      async (
        workspaceId: string,
        runId: string,
        _mode: string,
        conversations: Array<{
          contactId: string;
          messages?: Array<{ content?: string; direction?: string }>;
          contact?: { phone?: string };
        }>,
      ) => {
        let processed = 0;
        let skipped = 0;
        for (const conversation of conversations) {
          const messages = conversation.messages;
          const contact = conversation.contact;
          const lastMessage = messages?.[0];
          const phone = String(contact?.phone || '').trim();
          const messageContent = String(lastMessage?.content || '').trim();
          const messageDirection = String(lastMessage?.direction || '').toUpperCase();

          if (!phone || !messageContent || messageDirection !== 'INBOUND') {
            skipped += 1;
            continue;
          }

          try {
            const reply = await unifiedAgent.processIncomingMessage({
              workspaceId,
              runId,
              contactId: conversation.contactId,
              phone,
              message: messageContent,
            } as never);
            if (reply?.reply || reply?.response) {
              await whatsappService.sendMessage({
                workspaceId,
                phone,
                message: reply.reply || reply.response,
              } as never);
              processed += 1;
            } else {
              skipped += 1;
            }
          } catch {
            skipped += 1;
          }
        }
        // Mirror real CiaInlineFallbackService: publish inline fallback phase event
        await agentEvents.publish({
          type: 'status',
          workspaceId,
          runId,
          phase: 'backlog_inline_fallback',
          persistent: true,
          message: `Worker indisponível. Vou responder ${conversations.length} conversas inline agora.`,
          meta: { total: conversations.length },
        });
        // Mirror real CiaInlineFallbackService: always finalizes with a catalog refresh
        await runtimeState.scheduleContactCatalogRefresh(workspaceId, 'inline_backlog_completed');
        return { processed, skipped, message: `Processed ${processed} inline.` };
      },
    ),
  };

  // Minimal remoteBacklog stub: returns empty results by default
  const remoteBacklog = {
    scanRemoteBacklog: jest.fn().mockResolvedValue({ found: [], total: 0 }),
    runRemoteBacklog: jest.fn().mockResolvedValue({ processed: 0, skipped: 0 }),
  };

  return new CiaBacklogRunService(
    prisma as never,
    providerRegistry as never,
    agentEvents as never,
    chatFilter as never,
    runtimeState as never,
    workerRuntime as never,
    inlineFallback as never,
    remoteBacklog as never,
    bootstrapService as never,
    catchupService as never,
  );
}
