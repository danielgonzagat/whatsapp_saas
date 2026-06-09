import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { MindMessageService } from './mind-message.service';

/**
 * Covers the flag-gated canonical READER cut-over for `RAC_MindMessage`
 * (message-memory-cutover, MIGRATION_PLAYBOOK.md) on
 * `MindMessageService.getHistory`.
 *
 * Contract:
 *   - flag OFF (default) → ONLY the legacy `prisma.kloelMessage.findMany`
 *     fires; the canonical `prisma.mindMessage` delegate is NEVER touched
 *     (byte-identical to today);
 *   - flag ON + canonical rows present → reads `prisma.mindMessage`, returns
 *     the same `{id, role, content, timestamp}` projection, legacy untouched;
 *   - flag ON + canonical EMPTY → falls back to the legacy read;
 *   - flag ON + canonical THROWS → falls back to the legacy read.
 */
describe('MindMessageService — RAC_MindMessage canonical read (KLOEL_MINDMESSAGE_READ_CANONICAL)', () => {
  let service: MindMessageService;
  let prisma: {
    kloelMessage: { findMany: jest.Mock };
    mindMessage: { findMany: jest.Mock };
  };

  const legacyRows = [
    {
      id: 'legacy-1',
      role: 'user',
      content: 'legacy hi',
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
    },
  ];
  const canonicalRows = [
    {
      id: 'canon-1',
      role: 'assistant',
      content: 'canonical hi',
      createdAt: new Date('2026-06-02T00:00:00.000Z'),
    },
  ];

  const originalFlag = process.env.KLOEL_MINDMESSAGE_READ_CANONICAL;

  beforeEach(async () => {
    prisma = {
      kloelMessage: { findMany: jest.fn().mockResolvedValue(legacyRows) },
      mindMessage: { findMany: jest.fn().mockResolvedValue(canonicalRows) },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [MindMessageService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(MindMessageService);
  });

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.KLOEL_MINDMESSAGE_READ_CANONICAL;
    } else {
      process.env.KLOEL_MINDMESSAGE_READ_CANONICAL = originalFlag;
    }
    jest.restoreAllMocks();
  });

  it('flag OFF (unset) → only the legacy KloelMessage read fires', async () => {
    delete process.env.KLOEL_MINDMESSAGE_READ_CANONICAL;

    const result = await service.getHistory('ws-1', 50);

    expect(prisma.kloelMessage.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.mindMessage.findMany).not.toHaveBeenCalled();
    expect(result).toEqual([
      { id: 'legacy-1', role: 'user', content: 'legacy hi', timestamp: legacyRows[0].createdAt },
    ]);
  });

  it("flag OFF (value !== 'true') → only the legacy KloelMessage read fires", async () => {
    process.env.KLOEL_MINDMESSAGE_READ_CANONICAL = 'false';

    await service.getHistory('ws-1', 50);

    expect(prisma.kloelMessage.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.mindMessage.findMany).not.toHaveBeenCalled();
  });

  it('flag ON + canonical rows present → reads MindMessage, legacy untouched', async () => {
    process.env.KLOEL_MINDMESSAGE_READ_CANONICAL = 'true';

    const result = await service.getHistory('ws-1', 50);

    expect(prisma.mindMessage.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.mindMessage.findMany).toHaveBeenCalledWith({
      where: { workspaceId: 'ws-1', source: 'brain' },
      orderBy: { createdAt: 'asc' },
      take: 50,
      select: { id: true, role: true, content: true, createdAt: true },
    });
    expect(prisma.kloelMessage.findMany).not.toHaveBeenCalled();
    expect(result).toEqual([
      {
        id: 'canon-1',
        role: 'assistant',
        content: 'canonical hi',
        timestamp: canonicalRows[0].createdAt,
      },
    ]);
  });

  it('flag ON + canonical EMPTY → falls back to the legacy read', async () => {
    process.env.KLOEL_MINDMESSAGE_READ_CANONICAL = 'true';
    prisma.mindMessage.findMany.mockResolvedValue([]);

    const result = await service.getHistory('ws-1', 50);

    expect(prisma.mindMessage.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.kloelMessage.findMany).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      { id: 'legacy-1', role: 'user', content: 'legacy hi', timestamp: legacyRows[0].createdAt },
    ]);
  });

  it('flag ON + canonical THROWS → falls back to the legacy read', async () => {
    process.env.KLOEL_MINDMESSAGE_READ_CANONICAL = 'true';
    prisma.mindMessage.findMany.mockRejectedValue(new Error('canonical table down'));

    const result = await service.getHistory('ws-1', 50);

    expect(prisma.mindMessage.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.kloelMessage.findMany).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      { id: 'legacy-1', role: 'user', content: 'legacy hi', timestamp: legacyRows[0].createdAt },
    ]);
  });

  it('empty workspaceId short-circuits before any read (both flag states)', async () => {
    process.env.KLOEL_MINDMESSAGE_READ_CANONICAL = 'true';

    const result = await service.getHistory('', 50);

    expect(result).toEqual([]);
    expect(prisma.mindMessage.findMany).not.toHaveBeenCalled();
    expect(prisma.kloelMessage.findMany).not.toHaveBeenCalled();
  });
});
