import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ChatService } from './chat.service';
import { PrismaService } from '../prisma/prisma.service';
import { createPartialPrismaMock } from '../../test/helpers/prisma.mock';

/**
 * Covers the ADDITIVE, flag-gated dual-write to the canonical `RAC_MindMessage`
 * table (Brain → Mind unification PI-K23 / Claude-K50) at the PRIMARY dashboard
 * chat persist site (`ChatService.addMessage`).
 *
 * Contract:
 *   - flag OFF (default) → ONLY the legacy `prisma.chatMessage.create` fires;
 *   - flag ON            → BOTH the legacy write AND `prisma.mindMessage.create`
 *                          fire, with the mapped record (source='dashboard');
 *   - the dual-write is best-effort: if `prisma.mindMessage.create` rejects, the
 *     legacy write result is still returned (the failure never propagates).
 */
describe('ChatService — RAC_MindMessage dual-write (KLOEL_MINDMESSAGE_DUALWRITE)', () => {
  let service: ChatService;
  let mockPrisma: ReturnType<typeof createPartialPrismaMock>;

  const workspaceId = 'ws-dw';
  const conversationId = 'conv-dw';
  const userId = 'user-dw';

  const legacyRow = {
    id: 'msg-dw-1',
    role: 'user',
    content: 'hello',
    createdAt: new Date('2026-06-03T00:00:00.000Z'),
    userId,
  };

  const originalFlag = process.env.KLOEL_MINDMESSAGE_DUALWRITE;

  beforeEach(async () => {
    mockPrisma = createPartialPrismaMock({
      chatMessage: ['create'],
      chatThread: ['findFirstOrThrow', 'updateMany'],
      mindMessage: ['create'],
    });
    mockPrisma.chatThread.findFirstOrThrow.mockResolvedValue({ id: conversationId });
    mockPrisma.chatMessage.create.mockResolvedValue(legacyRow);
    mockPrisma.chatThread.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.mindMessage.create.mockResolvedValue({
      id: 'mind-dw-1',
      workspaceId,
      source: 'dashboard',
      role: 'user',
      content: 'hello',
    });

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [ChatService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = moduleRef.get<ChatService>(ChatService);
  });

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.KLOEL_MINDMESSAGE_DUALWRITE;
    } else {
      process.env.KLOEL_MINDMESSAGE_DUALWRITE = originalFlag;
    }
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('flag OFF (unset) → only the legacy ChatMessage write fires', async () => {
    delete process.env.KLOEL_MINDMESSAGE_DUALWRITE;

    const result = await service.addMessage(workspaceId, conversationId, userId, 'user', 'hello');

    expect(mockPrisma.chatMessage.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.mindMessage.create).not.toHaveBeenCalled();
    expect(result).toBe(legacyRow);
  });

  it("flag OFF (value !== 'true') → only the legacy ChatMessage write fires", async () => {
    process.env.KLOEL_MINDMESSAGE_DUALWRITE = 'false';

    await service.addMessage(workspaceId, conversationId, userId, 'user', 'hello');

    expect(mockPrisma.chatMessage.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.mindMessage.create).not.toHaveBeenCalled();
  });

  it('flag ON → BOTH writes fire; mindMessage gets the mapped record with source=dashboard', async () => {
    process.env.KLOEL_MINDMESSAGE_DUALWRITE = 'true';

    const result = await service.addMessage(workspaceId, conversationId, userId, 'user', 'hello');

    // Legacy write kept EXACTLY as-is, and its result is what we return.
    expect(mockPrisma.chatMessage.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.chatMessage.create).toHaveBeenCalledWith({
      data: { threadId: conversationId, workspaceId, userId, role: 'user', content: 'hello' },
      select: { id: true, role: true, content: true, createdAt: true, userId: true },
    });

    // Canonical dual-write with the mapped record + source discriminator.
    expect(mockPrisma.mindMessage.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.mindMessage.create).toHaveBeenCalledWith({
      data: { workspaceId, source: 'dashboard', role: 'user', content: 'hello' },
    });

    expect(result).toBe(legacyRow);
  });

  it('flag ON + dual-write throws → legacy result still returned, error swallowed with warn-log', async () => {
    process.env.KLOEL_MINDMESSAGE_DUALWRITE = 'true';
    mockPrisma.mindMessage.create.mockRejectedValue(new Error('canonical table down'));
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    const result = await service.addMessage(workspaceId, conversationId, userId, 'user', 'hello');

    expect(mockPrisma.chatMessage.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.mindMessage.create).toHaveBeenCalledTimes(1);
    expect(result).toBe(legacyRow);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0]?.[0] ?? '')).toContain('canonical table down');
  });
});
