import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { MindMemoryItemService } from './mind-memory-item.service';

/**
 * Covers the flag-gated canonical READER cut-over for `RAC_MindMemory`
 * (message-memory-cutover, MIGRATION_PLAYBOOK.md) on
 * `MindMemoryItemService.findByKey` / `listByWorkspace`.
 *
 * Contract:
 *   - flag OFF (default) → ONLY the legacy `prisma.kloelMemory` reads fire;
 *     the canonical `prisma.mindMemory` delegate is NEVER touched
 *     (byte-identical to today);
 *   - flag ON + canonical row present → reads `prisma.mindMemory` SCOPED to
 *     `namespace='default'`, strips the `namespace` field from the result,
 *     legacy untouched;
 *   - flag ON + canonical MISSING/EMPTY → falls back to the legacy read;
 *   - flag ON + canonical THROWS → falls back to the legacy read.
 */
describe('MindMemoryItemService — RAC_MindMemory canonical read (KLOEL_MINDMEMORY_READ_CANONICAL)', () => {
  let service: MindMemoryItemService;
  let prisma: {
    kloelMemory: { findUnique: jest.Mock; findMany: jest.Mock };
    mindMemory: { findUnique: jest.Mock; findMany: jest.Mock };
  };

  const legacyRow = {
    id: 'legacy-mem-1',
    workspaceId: 'ws-1',
    key: 'agent:state',
    value: { src: 'legacy' },
    category: 'agent_state',
    type: null,
    content: null,
    metadata: null,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
  };
  // Canonical row mirrors the legacy shape PLUS the `namespace` discriminator.
  const canonicalRow = {
    id: 'canon-mem-1',
    workspaceId: 'ws-1',
    namespace: 'default',
    key: 'agent:state',
    value: { src: 'canonical' },
    category: 'agent_state',
    type: null,
    content: null,
    metadata: null,
    createdAt: new Date('2026-06-02T00:00:00.000Z'),
    updatedAt: new Date('2026-06-02T00:00:00.000Z'),
  };
  // The mapped result the service must return (namespace stripped).
  const { namespace: _ns, ...canonicalMapped } = canonicalRow;

  const originalFlag = process.env.KLOEL_MINDMEMORY_READ_CANONICAL;

  beforeEach(async () => {
    prisma = {
      kloelMemory: {
        findUnique: jest.fn().mockResolvedValue(legacyRow),
        findMany: jest.fn().mockResolvedValue([legacyRow]),
      },
      mindMemory: {
        findUnique: jest.fn().mockResolvedValue(canonicalRow),
        findMany: jest.fn().mockResolvedValue([canonicalRow]),
      },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [MindMemoryItemService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(MindMemoryItemService);
  });

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.KLOEL_MINDMEMORY_READ_CANONICAL;
    } else {
      process.env.KLOEL_MINDMEMORY_READ_CANONICAL = originalFlag;
    }
    jest.restoreAllMocks();
  });

  // ── findByKey ─────────────────────────────────────────────────────────────

  it('findByKey flag OFF (unset) → only the legacy KloelMemory read fires', async () => {
    delete process.env.KLOEL_MINDMEMORY_READ_CANONICAL;

    const result = await service.findByKey('ws-1', 'agent:state');

    expect(prisma.kloelMemory.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.mindMemory.findUnique).not.toHaveBeenCalled();
    expect(result).toBe(legacyRow);
  });

  it("findByKey flag OFF (value !== 'true') → only the legacy read fires", async () => {
    process.env.KLOEL_MINDMEMORY_READ_CANONICAL = 'false';

    await service.findByKey('ws-1', 'agent:state');

    expect(prisma.kloelMemory.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.mindMemory.findUnique).not.toHaveBeenCalled();
  });

  it("findByKey flag ON + canonical present → reads MindMemory scoped to namespace='default', strips namespace", async () => {
    process.env.KLOEL_MINDMEMORY_READ_CANONICAL = 'true';

    const result = await service.findByKey('ws-1', 'agent:state');

    expect(prisma.mindMemory.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.mindMemory.findUnique).toHaveBeenCalledWith({
      where: {
        workspaceId_namespace_key: {
          workspaceId: 'ws-1',
          namespace: 'default',
          key: 'agent:state',
        },
      },
    });
    expect(prisma.kloelMemory.findUnique).not.toHaveBeenCalled();
    expect(result).toEqual(canonicalMapped);
    expect(result).not.toHaveProperty('namespace');
  });

  it('findByKey flag ON + canonical MISSING → falls back to the legacy read', async () => {
    process.env.KLOEL_MINDMEMORY_READ_CANONICAL = 'true';
    prisma.mindMemory.findUnique.mockResolvedValue(null);

    const result = await service.findByKey('ws-1', 'agent:state');

    expect(prisma.mindMemory.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.kloelMemory.findUnique).toHaveBeenCalledTimes(1);
    expect(result).toBe(legacyRow);
  });

  it('findByKey flag ON + canonical THROWS → falls back to the legacy read', async () => {
    process.env.KLOEL_MINDMEMORY_READ_CANONICAL = 'true';
    prisma.mindMemory.findUnique.mockRejectedValue(new Error('canonical table down'));

    const result = await service.findByKey('ws-1', 'agent:state');

    expect(prisma.mindMemory.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.kloelMemory.findUnique).toHaveBeenCalledTimes(1);
    expect(result).toBe(legacyRow);
  });

  // ── listByWorkspace ────────────────────────────────────────────────────────

  it('listByWorkspace flag OFF (unset) → only the legacy read fires', async () => {
    delete process.env.KLOEL_MINDMEMORY_READ_CANONICAL;

    const result = await service.listByWorkspace('ws-1');

    expect(prisma.kloelMemory.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.mindMemory.findMany).not.toHaveBeenCalled();
    expect(result).toEqual([legacyRow]);
  });

  it("listByWorkspace flag ON + canonical present → reads MindMemory scoped to namespace='default', strips namespace", async () => {
    process.env.KLOEL_MINDMEMORY_READ_CANONICAL = 'true';

    const result = await service.listByWorkspace('ws-1', { category: 'agent_state' });

    expect(prisma.mindMemory.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.mindMemory.findMany).toHaveBeenCalledWith({
      where: { workspaceId: 'ws-1', namespace: 'default', category: 'agent_state' },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
    expect(prisma.kloelMemory.findMany).not.toHaveBeenCalled();
    expect(result).toEqual([canonicalMapped]);
    expect(result[0]).not.toHaveProperty('namespace');
  });

  it('listByWorkspace flag ON + canonical EMPTY → falls back to the legacy read', async () => {
    process.env.KLOEL_MINDMEMORY_READ_CANONICAL = 'true';
    prisma.mindMemory.findMany.mockResolvedValue([]);

    const result = await service.listByWorkspace('ws-1');

    expect(prisma.mindMemory.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.kloelMemory.findMany).toHaveBeenCalledTimes(1);
    expect(result).toEqual([legacyRow]);
  });

  it('listByWorkspace flag ON + canonical THROWS → falls back to the legacy read', async () => {
    process.env.KLOEL_MINDMEMORY_READ_CANONICAL = 'true';
    prisma.mindMemory.findMany.mockRejectedValue(new Error('canonical table down'));

    const result = await service.listByWorkspace('ws-1');

    expect(prisma.mindMemory.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.kloelMemory.findMany).toHaveBeenCalledTimes(1);
    expect(result).toEqual([legacyRow]);
  });
});
