import { Test, TestingModule } from '@nestjs/testing';
import { InboxService } from './inbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { InboxGateway } from './inbox.gateway';
import { WebhookDispatcherService } from '../webhooks/webhook-dispatcher.service';
import { ChannelTransportRegistry } from '../kloel/channel-transport.registry';
import { type FlexMock } from '../../test/helpers/prisma.mock';

// Shared test harness for the inbox service specs
// (`inbox.service.spec.ts` + `inbox.service.operations.spec.ts`), split out
// so each spec stays inside the architecture size guardrail. The `.fixtures`
// suffix keeps this file out of the jest testRegex (only `.spec.ts` files are
// collected) and out of the build typecheck (tsconfig.build.json excludes
// fixtures files).
export type MockPrisma = {
  agent: {
    findMany: FlexMock;
    findFirst: FlexMock;
  };
  contact: {
    findUnique: FlexMock;
    create: FlexMock;
  };
  conversation: {
    findMany: FlexMock;
    findFirst: FlexMock;
    findFirstOrThrow: FlexMock;
    findUnique: FlexMock;
    create: FlexMock;
    update: FlexMock;
    updateMany: FlexMock;
  };
  message: { create: FlexMock; findMany: FlexMock };
  mindMessage: { create: FlexMock };
  $transaction: FlexMock;
};

export type MockGateway = { emitToWorkspace: jest.Mock };

export type MockDispatcher = { dispatch: jest.Mock };

export type MockChannelTransports = { send: jest.Mock };

/** Shape returned by `saveMessage` — mirrors the Prisma Message model fields. */
export interface SaveMessageResult {
  id: string;
  status: string;
  contactId: string;
  workspaceId: string;
  createdAt: Date;
  updatedAt: Date;
  externalId: string | null;
  direction: string;
  type: string;
  content: string;
  mediaUrl: string | null;
  errorCode: string | null;
  conversationId: string | null;
  agentId: string | null;
}

export const messageStub: SaveMessageResult = {
  id: 'msg-1',
  status: 'DELIVERED',
  contactId: 'contact-1',
  workspaceId: 'ws-1',
  createdAt: new Date(),
  updatedAt: new Date(),
  externalId: null,
  direction: 'OUTBOUND',
  type: 'TEXT',
  content: '',
  mediaUrl: null,
  errorCode: null,
  conversationId: null,
  agentId: null,
};

export type TxOverrides = Partial<{
  findFirst: jest.Mock;
  create: jest.Mock;
  messageCreate: jest.Mock;
  conversationUpdate: jest.Mock;
}>;

export interface TxClientMock {
  conversation: {
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    findFirstOrThrow: jest.Mock;
  };
  message: { create: jest.Mock };
}

/** Payload received by `message.create` inside `saveMessage`. */
export interface MessageCreateArgs {
  data: Record<string, unknown>;
}

/** Payload received by `conversation.updateMany` inside `saveMessage`. */
export interface ConversationUpdateArgs {
  data: Record<string, unknown>;
  where: Record<string, unknown>;
}

export function buildTxClient(overrides: TxOverrides = {}): TxClientMock {
  return {
    conversation: {
      findFirst: overrides.findFirst ?? jest.fn().mockResolvedValue(null),
      create:
        overrides.create ??
        jest.fn().mockResolvedValue({
          id: 'conv-1',
          workspaceId: 'ws-1',
          contactId: 'contact-1',
          channel: 'WHATSAPP',
          status: 'OPEN',
          lastMessageAt: new Date('2026-04-08T00:00:00Z'),
          unreadCount: 0,
        }),
      update:
        overrides.conversationUpdate ??
        jest.fn().mockResolvedValue({
          id: 'conv-1',
          status: 'OPEN',
          unreadCount: 1,
          lastMessageAt: new Date(),
          contact: { id: 'contact-1', name: null, phone: '5511999999999' },
        }),
      updateMany: overrides.conversationUpdate ?? jest.fn().mockResolvedValue({ count: 1 }),
      findFirstOrThrow: jest.fn().mockResolvedValue({
        id: 'conv-1',
        status: 'OPEN',
        unreadCount: 1,
        lastMessageAt: new Date(),
        contact: { id: 'contact-1', name: null, phone: '5511999999999' },
      }),
    },
    message: {
      create:
        overrides.messageCreate ??
        jest.fn().mockResolvedValue({
          id: 'msg-1',
          conversationId: 'conv-1',
          workspaceId: 'ws-1',
          contactId: 'contact-1',
          content: 'hi',
          direction: 'INBOUND',
          status: 'DELIVERED',
        }),
    },
  };
}

export interface InboxTestContext {
  service: InboxService;
  prisma: MockPrisma;
  gateway: MockGateway;
  dispatcher: MockDispatcher;
  channelTransports: MockChannelTransports;
}

/** Build the InboxService testing module with fresh mocks (per-test setup). */
export async function createInboxTestContext(): Promise<InboxTestContext> {
  const prisma: MockPrisma = {
    agent: {
      findMany: jest.fn() as FlexMock,
      findFirst: jest.fn() as FlexMock,
    },
    contact: {
      findUnique: jest.fn() as FlexMock,
      create: jest.fn() as FlexMock,
    },
    conversation: {
      findMany: jest.fn() as FlexMock,
      findFirst: jest.fn() as FlexMock,
      findFirstOrThrow: jest.fn() as FlexMock,
      findUnique: jest.fn() as FlexMock,
      create: jest.fn() as FlexMock,
      update: jest.fn() as FlexMock,
      updateMany: jest.fn().mockResolvedValue({ count: 1 }) as FlexMock,
    },
    message: { create: jest.fn() as FlexMock, findMany: jest.fn() as FlexMock },
    mindMessage: { create: jest.fn().mockResolvedValue({ id: 'mind-1' }) as FlexMock },
    $transaction: jest.fn() as FlexMock,
  };
  const gateway: MockGateway = { emitToWorkspace: jest.fn() };
  const dispatcher: MockDispatcher = { dispatch: jest.fn().mockResolvedValue(undefined) };
  const channelTransports: MockChannelTransports = {
    send: jest.fn().mockResolvedValue({ success: true }),
  };

  const testingModule: TestingModule = await Test.createTestingModule({
    providers: [
      InboxService,
      { provide: PrismaService, useValue: prisma },
      { provide: InboxGateway, useValue: gateway },
      { provide: WebhookDispatcherService, useValue: dispatcher },
      { provide: ChannelTransportRegistry, useValue: channelTransports },
    ],
  }).compile();

  return {
    service: testingModule.get(InboxService),
    prisma,
    gateway,
    dispatcher,
    channelTransports,
  };
}
