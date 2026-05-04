import type { PrismaService } from '../prisma/prisma.service';
import { WhatsAppCatchupService } from './whatsapp-catchup.service';

/** Catchup prisma mock type. */
export type CatchupPrismaMock = {
  $transaction: jest.Mock;
  workspace: {
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  contact: {
    findUnique: jest.Mock;
    upsert: jest.Mock;
    updateMany: jest.Mock;
    findFirst: jest.Mock;
  };
  conversation: {
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
};

/** Catchup provider registry mock type. */
export type CatchupProviderRegistryMock = {
  getProviderType: jest.Mock;
  extractPhoneFromChatId: jest.Mock;
  listLidMappings: jest.Mock;
  getChats: jest.Mock;
  getChatMessages: jest.Mock;
  sendSeen: jest.Mock;
  readChatMessages: jest.Mock;
  upsertContactProfile: jest.Mock;
};

/** Catchup inbound processor mock type. */
export type CatchupInboundProcessorMock = {
  process: jest.Mock;
};

/** Catchup inbox mock type. */
export type CatchupInboxMock = {
  saveMessageByPhone: jest.Mock;
};

/** Catchup redis mock type. */
export type CatchupRedisMock = {
  set: jest.Mock;
  get: jest.Mock;
  del: jest.Mock;
};

/** Catchup agent events mock type. */
export type CatchupAgentEventsMock = {
  publish: jest.Mock;
};

/** Catchup cia runtime mock type. */
export type CatchupCiaRuntimeMock = {
  startBacklogRun: jest.Mock;
};

/** Catchup worker runtime mock type. */
export type CatchupWorkerRuntimeMock = {
  isAvailable: jest.Mock;
};

type CatchupServiceInternals = {
  runCatchup: (workspaceId: string, reason: string, lockToken: string) => Promise<unknown>;
};

/** Run catchup. */
export function runCatchup(
  service: WhatsAppCatchupService,
  workspaceId: string,
  reason: string,
  lockToken: string,
) {
  return (service as never as CatchupServiceInternals).runCatchup(workspaceId, reason, lockToken);
}

/** Apply catchup environment defaults used across spec setups. */
export function applyCatchupEnvDefaults(): void {
  process.env.WAHA_CATCHUP_MAX_CHATS = '1';
  process.env.WAHA_CATCHUP_MAX_PASSES = '3';
  process.env.WAHA_CATCHUP_MAX_MESSAGES_PER_CHAT = '2';
  process.env.WAHA_CATCHUP_MAX_PAGES_PER_CHAT = '3';
  process.env.WAHA_CATCHUP_FALLBACK_CHATS_PER_PASS = '1';
  process.env.WAHA_CATCHUP_FALLBACK_PAGES_PER_CHAT = '1';
  process.env.WAHA_CATCHUP_LOOKBACK_MS = `${60 * 60 * 1000}`;
  process.env.WAHA_CATCHUP_MARK_READ_WITHOUT_REPLY = 'true';
}

/** Bundle of fresh catchup mocks ready to be wired into the service constructor. */
export type CatchupMocks = {
  prisma: CatchupPrismaMock;
  providerRegistry: CatchupProviderRegistryMock;
  inboundProcessor: CatchupInboundProcessorMock;
  inbox: CatchupInboxMock;
  redis: CatchupRedisMock;
  agentEvents: CatchupAgentEventsMock;
  ciaRuntime: CatchupCiaRuntimeMock;
  workerRuntime: CatchupWorkerRuntimeMock;
};

/** Build a fresh set of catchup mocks with sensible defaults for tests. */
export function buildCatchupMocks(): CatchupMocks {
  const prisma: any = {
    workspace: {
      findUnique: jest.fn().mockResolvedValue({
        name: 'Workspace Teste',
        providerSettings: { whatsappApiSession: {} },
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    contact: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({ id: 'contact-1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    conversation: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'conv-1' }),
      update: jest.fn().mockResolvedValue({ id: 'conv-1' }),
    },
  };
  prisma.$transaction = jest.fn((cb: any) => cb(prisma));

  const providerRegistry: CatchupProviderRegistryMock = {
    getProviderType: jest.fn().mockResolvedValue('whatsapp-api'),
    extractPhoneFromChatId: jest.fn((chatId: string) => String(chatId || '').split('@')[0]),
    listLidMappings: jest.fn().mockResolvedValue([]),
    getChats: jest.fn().mockResolvedValue([
      {
        id: '5511999999999@c.us',
        unreadCount: 3,
        timestamp: Date.now() - 60 * 60 * 1000,
      },
      {
        id: '5511888888888@c.us',
        unreadCount: 1,
        timestamp: Date.now() - 2 * 60 * 60 * 1000,
      },
    ]),
    getChatMessages: jest.fn().mockResolvedValue([]),
    sendSeen: jest.fn().mockResolvedValue(undefined),
    readChatMessages: jest.fn().mockResolvedValue(undefined),
    upsertContactProfile: jest.fn().mockResolvedValue(true),
  };

  const inboundProcessor: CatchupInboundProcessorMock = {
    process: jest.fn().mockResolvedValue({ deduped: false }),
  };

  const inbox: CatchupInboxMock = {
    saveMessageByPhone: jest.fn().mockResolvedValue({ id: 'outbound-history' }),
  };

  const redis: CatchupRedisMock = {
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue('lock-token'),
    del: jest.fn().mockResolvedValue(1),
  };

  const agentEvents: CatchupAgentEventsMock = {
    publish: jest.fn().mockResolvedValue(undefined),
  };

  const ciaRuntime: CatchupCiaRuntimeMock = {
    startBacklogRun: jest.fn().mockResolvedValue({ queued: true }),
  };

  const workerRuntime: CatchupWorkerRuntimeMock = {
    isAvailable: jest.fn().mockResolvedValue(true),
  };

  return {
    prisma,
    providerRegistry,
    inboundProcessor,
    inbox,
    redis,
    agentEvents,
    ciaRuntime,
    workerRuntime,
  };
}

/** Construct the service under test from a bundle of catchup mocks. */
export function buildCatchupService(mocks: CatchupMocks): WhatsAppCatchupService {
  return new WhatsAppCatchupService(
    mocks.prisma as never as PrismaService,
    mocks.providerRegistry as never,
    mocks.inboundProcessor as never,
    mocks.ciaRuntime as never,
    mocks.inbox as never,
    mocks.workerRuntime as never,
    mocks.redis as never,
    mocks.agentEvents as never,
  );
}
