// Shared test setup factory for WhatsappService specs.
// Executes inside the Jest environment when imported by a spec file.
import { WhatsappService } from './whatsapp.service';
import { CiaRuntimeService } from './cia-runtime.service';
import { WhatsAppProviderRegistry } from './providers/provider-registry';
import { WhatsAppApiProvider } from './providers/whatsapp-api.provider';
import { WhatsAppCatchupService } from './whatsapp-catchup.service';
import { WorkerRuntimeService } from './worker-runtime.service';
import { WorkspaceService } from '../workspaces/workspace.service';
import { InboxService } from '../inbox/inbox.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { NeuroCrmService } from '../crm/neuro-crm.service';
import { PrismaService } from '../prisma/prisma.service';
import Redis from 'ioredis';

const localContactsSeed = [
  {
    id: 'contact-1',
    workspaceId: 'ws-1',
    phone: '5511999991111',
    name: 'Alice CRM',
    email: 'alice@crm.test',
    leadScore: 92,
    sentiment: 'POSITIVE',
    purchaseProbability: 'HIGH',
    nextBestAction: 'Enviar proposta',
    aiSummary: 'Lead quente, pediu preço e prazo.',
    customFields: {
      purchaseProbabilityScore: 0.92,
      probabilityReasons: ['pediu preço', 'retornou rápido'],
      catalogedAt: '2026-03-21T12:00:00.000Z',
      lastScoredAt: '2026-03-21T12:05:00.000Z',
      whatsappSavedAt: '2026-03-21T12:01:00.000Z',
      intent: 'BUY',
    },
    createdAt: new Date('2026-03-20T08:00:00.000Z'),
    updatedAt: new Date('2026-03-20T09:00:00.000Z'),
  },
  {
    id: 'contact-2',
    workspaceId: 'ws-1',
    phone: '5511999993333',
    name: 'Contato Só CRM',
    email: null,
    leadScore: 31,
    sentiment: 'NEUTRAL',
    purchaseProbability: 'MEDIUM',
    nextBestAction: 'Fazer follow-up leve',
    aiSummary: 'Contato morno, já recebeu resposta.',
    customFields: {
      purchaseProbabilityScore: 0.31,
      probabilityReasons: ['interação curta'],
      catalogedAt: '2026-03-19T11:00:00.000Z',
      lastScoredAt: '2026-03-19T11:10:00.000Z',
      whatsappSavedAt: '2026-03-19T11:01:00.000Z',
      intent: 'INFO',
      buyerStatus: 'BOUGHT',
      purchasedProduct: 'Mentoria Premium',
      purchaseValue: 2497,
      purchaseReason: 'deal_won_recorded',
    },
    createdAt: new Date('2026-03-20T07:00:00.000Z'),
    updatedAt: new Date('2026-03-20T07:30:00.000Z'),
  },
];

const localConversationsSeed = [
  {
    id: 'conv-1',
    contactId: 'contact-1',
    unreadCount: 5,
    status: 'OPEN',
    mode: 'AI',
    assignedAgentId: null,
    lastMessageAt: new Date('2026-03-20T10:30:00.000Z'),
    messages: [
      {
        id: 'conv-1-msg-1',
        direction: 'INBOUND',
        createdAt: new Date('2026-03-20T10:30:00.000Z'),
      },
    ],
    contact: {
      id: 'contact-1',
      phone: '5511999991111',
      name: 'Alice CRM',
    },
  },
  {
    id: 'conv-2',
    contactId: 'contact-2',
    unreadCount: 0,
    status: 'OPEN',
    mode: 'AI',
    assignedAgentId: null,
    lastMessageAt: new Date('2026-03-20T10:00:00.000Z'),
    messages: [
      {
        id: 'conv-2-msg-1',
        direction: 'OUTBOUND',
        createdAt: new Date('2026-03-20T10:00:00.000Z'),
      },
    ],
    contact: {
      id: 'contact-2',
      phone: '5511999993333',
      name: 'Contato Só CRM',
    },
  },
];

const localMessagesSeed = [
  {
    id: 'db-msg-1',
    workspaceId: 'ws-1',
    contactId: 'contact-1',
    conversationId: 'conv-1',
    direction: 'INBOUND',
    content: 'Mensagem do banco',
    type: 'TEXT',
    mediaUrl: null,
    createdAt: new Date('2026-03-20T06:00:00.000Z'),
  },
];

export function buildWhatsappServiceSetup() {
  const queueModule = jest.requireMock('../queue/queue');
  const mockAutopilotAdd = queueModule.autopilotQueue.add;
  const mockFlowAdd = queueModule.flowQueue.add;

  type MockContact = {
    id: string;
    workspaceId: string;
    phone: string;
    name?: string;
    email?: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  const createdContacts: MockContact[] = [];
  const allContacts = () => [...localContactsSeed, ...createdContacts];

  const workspaceService = {
    getWorkspace: jest.fn().mockResolvedValue({
      id: 'ws-1',
      providerSettings: {
        autopilot: { enabled: false },
        whatsappApiSession: { status: 'connected' },
      },
    }),
    toEngineWorkspace: jest.fn((workspace: unknown) => workspace),
  };

  const inboxService = {
    saveMessageByPhone: jest.fn().mockResolvedValue({
      id: 'msg-1',
      contactId: 'contact-1',
    }),
  };

  const planLimits = {
    trackMessageSend: jest.fn().mockResolvedValue(undefined),
    ensureSubscriptionActive: jest.fn().mockResolvedValue(undefined),
  };

  const redis = {
    get: jest.fn().mockResolvedValue(null),
    setex: jest.fn().mockResolvedValue('OK'),
    set: jest.fn().mockResolvedValue('OK'),
    publish: jest.fn().mockResolvedValue(1),
    rpush: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
  };

  const neuroCrm = {
    analyzeContact: jest.fn().mockResolvedValue(undefined),
  };

  const prisma = {
    contact: {
      findMany: jest.fn().mockImplementation(({ where }: { where?: { workspaceId?: string } }) => {
        return Promise.resolve(
          allContacts().filter(
            (contact) => !where?.workspaceId || contact.workspaceId === where.workspaceId,
          ),
        );
      }),
      upsert: jest
        .fn()
        .mockImplementation(
          ({
            where,
            create,
            update,
          }: {
            where: { workspaceId_phone: { workspaceId: string; phone: string } };
            create: { workspaceId: string; phone: string; name?: string; email?: string | null };
            update?: { name?: string; email?: string | null };
          }) => {
            const existing = allContacts().find(
              (contact) =>
                contact.workspaceId === where.workspaceId_phone.workspaceId &&
                contact.phone === where.workspaceId_phone.phone,
            );

            if (existing) {
              const next = {
                ...existing,
                name: update?.name ?? existing.name,
                email: update?.email ?? existing.email,
                updatedAt: new Date('2026-03-20T12:00:00.000Z'),
              };
              return Promise.resolve(next);
            }

            const next = {
              id: `contact-${createdContacts.length + 10}`,
              workspaceId: create.workspaceId,
              phone: create.phone,
              name: create.name,
              email: create.email || null,
              createdAt: new Date('2026-03-20T12:00:00.000Z'),
              updatedAt: new Date('2026-03-20T12:00:00.000Z'),
            };
            createdContacts.push(next);
            return Promise.resolve(next);
          },
        ),
      findUnique: jest
        .fn()
        .mockImplementation(
          ({ where }: { where: { workspaceId_phone: { workspaceId: string; phone: string } } }) => {
            const found = allContacts().find(
              (contact) =>
                contact.workspaceId === where.workspaceId_phone.workspaceId &&
                contact.phone === where.workspaceId_phone.phone,
            );
            return Promise.resolve(found ? { id: found.id } : null);
          },
        ),
      update: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    conversation: {
      findMany: jest.fn().mockResolvedValue(localConversationsSeed),
    },
    message: {
      findMany: jest.fn().mockResolvedValue(localMessagesSeed),
      findFirst: jest.fn().mockResolvedValue({
        createdAt: new Date('2026-03-20T11:00:00.000Z'),
      }),
      create: jest.fn().mockResolvedValue({ id: 'outbound-msg-1' }),
      update: jest.fn().mockResolvedValue({}),
    },
    autopilotEvent: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
    tag: {
      upsert: jest.fn().mockResolvedValue({ id: 'tag-1' }),
      findUnique: jest.fn().mockResolvedValue(null),
    },
  };

  const providerRegistry = {
    getSessionStatus: jest.fn().mockResolvedValue({
      connected: true,
      status: 'CONNECTED',
    }),
    disconnect: jest.fn().mockResolvedValue({ success: true }),
    startSession: jest.fn().mockResolvedValue({ success: true }),
    // messageLimit: enforced via PlanLimitsService.trackMessageSend
    sendMessage: jest.fn().mockResolvedValue({ success: true, messageId: 'provider-msg-1' }),
    getProviderType: jest.fn().mockResolvedValue('whatsapp-api'),
    getContacts: jest.fn().mockResolvedValue([
      {
        id: '5511999991111@c.us',
        name: 'Alice WA',
        pushName: 'Alice App',
      },
      {
        id: '5511999992222@c.us',
        pushName: 'Bob App',
      },
    ]),
    getChats: jest.fn().mockResolvedValue([
      {
        id: '5511999991111@c.us',
        unreadCount: 2,
        timestamp: 1_742_467_800,
      },
      {
        id: '5511999992222@c.us',
        unread: 1,
        lastMessageTimestamp: 1_742_464_200,
      },
      {
        id: '5511999993333@c.us',
        unreadCount: 0,
        timestamp: 1_742_460_000,
      },
    ]),
    getChatMessages: jest.fn().mockResolvedValue([
      {
        id: 'm-new',
        chatId: '5511999991111@c.us',
        body: 'Mensagem nova',
        timestamp: 1_742_467_900,
        fromMe: false,
        type: 'chat',
      },
      {
        id: 'm-old',
        chatId: '5511999991111@c.us',
        body: 'Mensagem antiga',
        timestamp: 1_742_464_100,
        fromMe: false,
        type: 'chat',
      },
      {
        id: 'm-out',
        chatId: '5511999991111@c.us',
        body: 'Resposta enviada',
        timestamp: 1_742_466_100,
        fromMe: true,
        type: 'chat',
      },
    ]),
    sendTyping: jest.fn().mockResolvedValue(undefined),
    stopTyping: jest.fn().mockResolvedValue(undefined),
    sendSeen: jest.fn().mockResolvedValue(undefined),
    readChatMessages: jest.fn().mockResolvedValue(undefined),
    setPresence: jest.fn().mockResolvedValue(undefined),
    isRegisteredUser: jest.fn().mockResolvedValue(true),
    isRegistered: jest.fn().mockResolvedValue(true),
    upsertContactProfile: jest.fn().mockResolvedValue(true),
    extractPhoneFromChatId: jest.fn((chatId: string) => String(chatId || '').split('@')[0]),
    getQrCode: jest.fn().mockResolvedValue({ success: true, qr: 'qr-code' }),
    getSessionDiagnostics: jest.fn().mockResolvedValue({}),
    deleteSession: jest.fn().mockResolvedValue(true),
  };

  const whatsappApi = {
    getRuntimeConfigDiagnostics: jest.fn().mockReturnValue({
      webhookUrl: 'https://api.kloel.test/webhooks/whatsapp-api',
      webhookConfigured: true,
      inboundEventsConfigured: true,
      events: ['session.status', 'message', 'message.any', 'message.ack'],
      secretConfigured: true,
      storeEnabled: true,
      storeFullSync: true,
      allowSessionWithoutWebhook: false,
    }),
  };

  const catchupService = {
    triggerCatchup: jest.fn().mockImplementation((_ws: string, reason: string) => ({
      scheduled: true,
      reason,
    })),
  };

  const ciaRuntime = {
    startBacklogRun: jest.fn().mockResolvedValue({
      queued: true,
      runId: 'run-1',
    }),
  };

  const workerRuntime = {
    isAvailable: jest.fn().mockResolvedValue(true),
  };

  mockAutopilotAdd.mockResolvedValue(undefined);
  mockFlowAdd.mockResolvedValue(undefined);

  const service = new WhatsappService(
    workspaceService as unknown as WorkspaceService,
    inboxService as unknown as InboxService,
    planLimits as unknown as PlanLimitsService,
    redis as unknown as Redis,
    neuroCrm as unknown as NeuroCrmService,
    prisma as unknown as PrismaService,
    providerRegistry as unknown as WhatsAppProviderRegistry,
    whatsappApi as unknown as WhatsAppApiProvider,
    catchupService as unknown as WhatsAppCatchupService,
    ciaRuntime as unknown as CiaRuntimeService,
    workerRuntime as unknown as WorkerRuntimeService,
  );

  return {
    service,
    mockAutopilotAdd,
    mockFlowAdd,
    workspaceService,
    inboxService,
    planLimits,
    redis,
    neuroCrm,
    prisma,
    providerRegistry,
    whatsappApi,
    catchupService,
    ciaRuntime,
    workerRuntime,
  };
}

export type WhatsappServiceSetup = ReturnType<typeof buildWhatsappServiceSetup>;
