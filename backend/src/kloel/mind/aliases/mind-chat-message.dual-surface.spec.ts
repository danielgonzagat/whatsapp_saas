import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { MindChatMessageService } from './mind-chat-message.service';

/**
 * Brain → Mind alias contract for `MindChatMessageService`.
 *
 * The new `MindChatMessageService.items` and the legacy `prisma.chatMessage`
 * accessor MUST be the SAME Prisma delegate — they are two surfaces over the
 * one physical Postgres table `RAC_ChatMessage` (dashboard/thread chat). This
 * is a DISTINCT table from `RAC_KloelMessage` (brain); there is no table merge.
 *
 * This spec mocks Prisma at the table level so failures point at the wrapper,
 * not at the database, and asserts:
 *   (1) `.items` is reference-identical to the legacy `prisma.chatMessage`
 *       delegate (so migrated callers are byte-identical to legacy ones);
 *   (2) a read via `.items` deep-equals a read via the direct
 *       `prisma.chatMessage` call.
 */
describe('MindChatMessageService — dual surface (RAC_ChatMessage)', () => {
  let mindChatMessage: MindChatMessageService;
  let prisma: {
    chatMessage: { findUnique: jest.Mock; findMany: jest.Mock; create: jest.Mock };
  };

  const seededChatMessage = {
    id: 'chat-msg-1',
    threadId: 'thread-1',
    workspaceId: 'ws-chat-1',
    userId: 'user-1',
    role: 'assistant',
    content: 'olá pelo canal dashboard',
    metadata: null,
    deletedAt: null,
    createdAt: new Date('2026-06-04T12:00:00.000Z'),
    updatedAt: new Date('2026-06-04T12:00:00.000Z'),
  };

  beforeEach(async () => {
    prisma = {
      chatMessage: {
        findUnique: jest.fn().mockResolvedValue(seededChatMessage),
        findMany: jest.fn().mockResolvedValue([seededChatMessage]),
        create: jest.fn().mockResolvedValue(seededChatMessage),
      },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [MindChatMessageService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    mindChatMessage = moduleRef.get(MindChatMessageService);
  });

  it('.items is the SAME delegate as the legacy prisma.chatMessage accessor', () => {
    expect(mindChatMessage.items).toBe(prisma.chatMessage);
  });

  it('a read via .items deep-equals a read via direct prisma.chatMessage', async () => {
    const viaWrapper = (await mindChatMessage.items.findUnique({
      where: { id: seededChatMessage.id },
    })) as Record<string, unknown> | null;
    const viaLegacy = (await prisma.chatMessage.findUnique({
      where: { id: seededChatMessage.id },
    })) as Record<string, unknown> | null;

    expect(viaWrapper).toEqual(viaLegacy);
    expect(viaWrapper).toEqual(seededChatMessage);
  });

  it('a create via .items hits the same prisma.chatMessage.create delegate', async () => {
    await mindChatMessage.items.create({
      data: {
        threadId: seededChatMessage.threadId,
        workspaceId: seededChatMessage.workspaceId,
        userId: seededChatMessage.userId,
        role: 'user',
        content: 'mensagem de teste',
      },
    });

    expect(prisma.chatMessage.create).toHaveBeenCalledWith({
      data: {
        threadId: seededChatMessage.threadId,
        workspaceId: seededChatMessage.workspaceId,
        userId: seededChatMessage.userId,
        role: 'user',
        content: 'mensagem de teste',
      },
    });
  });
});
