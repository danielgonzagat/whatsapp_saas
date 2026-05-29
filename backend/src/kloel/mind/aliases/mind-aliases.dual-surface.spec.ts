import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { MindMemoryItemService } from './mind-memory-item.service';
import { MindMessageService } from './mind-message.service';

/**
 * Phase 1 (PI-K23 / Claude-K50) Brain → Mind alias contract:
 *
 * The new `MindMessageService` / `MindMemoryItemService` and the legacy
 * `prisma.kloelMessage` / `prisma.kloelMemory` accessors MUST return the
 * exact same row for the same id — they are two surfaces over the same
 * physical Postgres table (`RAC_KloelMessage` / `RAC_KloelMemory`).
 *
 * This spec mocks Prisma at the table level so failures point at the
 * wrapper, not at the database, and asserts:
 *   (1) the wrapper hits the same Prisma delegate as the legacy callers;
 *   (2) the row returned by the wrapper deep-equals the row returned by
 *       the direct `prisma.kloel*` call.
 */
describe('MindMessageService / MindMemoryItemService — dual surface', () => {
  let mindMessage: MindMessageService;
  let mindMemory: MindMemoryItemService;
  let prisma: {
    kloelMessage: { findUnique: jest.Mock; findMany: jest.Mock; create: jest.Mock };
    kloelMemory: { findUnique: jest.Mock };
  };

  const seededMessage = {
    id: 'msg-claude-k50',
    workspaceId: 'ws-claude-k50',
    role: 'assistant',
    content: 'hello mind',
    metadata: null,
    createdAt: new Date('2026-05-28T12:00:00.000Z'),
    updatedAt: new Date('2026-05-28T12:00:00.000Z'),
  };

  const seededMemory = {
    id: 'mem-claude-k50',
    workspaceId: 'ws-claude-k50',
    key: 'agent:state',
    value: { focus: 'brain-to-mind' },
    category: 'agent_state',
    type: null,
    content: null,
    metadata: null,
    embedding: null,
    createdAt: new Date('2026-05-28T12:00:00.000Z'),
    updatedAt: new Date('2026-05-28T12:00:00.000Z'),
  };

  beforeEach(async () => {
    prisma = {
      kloelMessage: {
        findUnique: jest.fn().mockResolvedValue(seededMessage),
        findMany: jest.fn().mockResolvedValue([seededMessage]),
        create: jest.fn().mockResolvedValue(seededMessage),
      },
      kloelMemory: { findUnique: jest.fn().mockResolvedValue(seededMemory) },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        MindMessageService,
        MindMemoryItemService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    mindMessage = moduleRef.get(MindMessageService);
    mindMemory = moduleRef.get(MindMemoryItemService);
  });

  it('MindMessageService.findById returns the same row as prisma.kloelMessage.findUnique', async () => {
    const viaWrapper = (await mindMessage.findById(seededMessage.id)) as Record<
      string,
      unknown
    > | null;
    const viaLegacy = (await prisma.kloelMessage.findUnique({
      where: { id: seededMessage.id },
    })) as Record<string, unknown> | null;

    expect(viaWrapper).toEqual(viaLegacy);
    expect(viaWrapper).toEqual(seededMessage);
    expect(prisma.kloelMessage.findUnique).toHaveBeenCalledWith({
      where: { id: seededMessage.id },
    });
  });

  it('MindMessageService.getHistory projects the canonical {id,role,content,timestamp} shape', async () => {
    const history = await mindMessage.getHistory(seededMessage.workspaceId, 50);

    expect(history).toEqual([
      {
        id: seededMessage.id,
        role: seededMessage.role,
        content: seededMessage.content,
        timestamp: seededMessage.createdAt,
      },
    ]);
    expect(prisma.kloelMessage.findMany).toHaveBeenCalledWith({
      where: { workspaceId: seededMessage.workspaceId },
      orderBy: { createdAt: 'asc' },
      take: 50,
      select: { id: true, role: true, content: true, createdAt: true },
    });
  });

  it('MindMessageService.getHistory returns [] when workspaceId is empty (no DB hit)', async () => {
    const history = await mindMessage.getHistory('', 50);
    expect(history).toEqual([]);
    expect(prisma.kloelMessage.findMany).not.toHaveBeenCalled();
  });

  it('MindMessageService.appendToConversation persists role+content under workspace scope', async () => {
    await mindMessage.appendToConversation(seededMessage.workspaceId, 'user', 'mensagem de teste');
    expect(prisma.kloelMessage.create).toHaveBeenCalledWith({
      data: {
        workspaceId: seededMessage.workspaceId,
        role: 'user',
        content: 'mensagem de teste',
      },
    });
  });

  it('MindMemoryItemService.findById returns the same row as prisma.kloelMemory.findUnique', async () => {
    const viaWrapper = (await mindMemory.findById(seededMemory.id)) as Record<
      string,
      unknown
    > | null;
    const viaLegacy = (await prisma.kloelMemory.findUnique({
      where: { id: seededMemory.id },
    })) as Record<string, unknown> | null;

    expect(viaWrapper).toEqual(viaLegacy);
    expect(viaWrapper).toEqual(seededMemory);
    expect(prisma.kloelMemory.findUnique).toHaveBeenCalledWith({ where: { id: seededMemory.id } });
  });

  it('MindMemoryItemService.findByKey resolves the (workspaceId, key) unique pair', async () => {
    const viaWrapper = await mindMemory.findByKey(seededMemory.workspaceId, seededMemory.key);

    expect(viaWrapper).toEqual(seededMemory);
    expect(prisma.kloelMemory.findUnique).toHaveBeenCalledWith({
      where: { workspaceId_key: { workspaceId: seededMemory.workspaceId, key: seededMemory.key } },
    });
  });
});
