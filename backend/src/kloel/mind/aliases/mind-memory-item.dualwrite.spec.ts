import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { MindMemoryItemService } from './mind-memory-item.service';

/**
 * Covers the ADDITIVE, flag-gated dual-write to the canonical `RAC_MindMemory`
 * table (Brain → Mind unification PI-K23 / Claude-K50).
 *
 * Contract:
 *   - flag OFF (default) → ONLY the legacy `prisma.kloelMemory.upsert` fires;
 *   - flag ON            → BOTH the legacy write AND `prisma.mindMemory.upsert`
 *                          fire, with the same mapped record;
 *   - the dual-write is best-effort: if `prisma.mindMemory.upsert` rejects, the
 *     legacy write result is still returned (the failure never propagates).
 */
describe('MindMemoryItemService — RAC_MindMemory dual-write (KLOEL_MINDMEMORY_DUALWRITE)', () => {
  let service: MindMemoryItemService;
  let prisma: {
    kloelMemory: { upsert: jest.Mock };
    mindMemory: { upsert: jest.Mock };
  };

  const legacyRow = {
    id: 'mem-dw-1',
    workspaceId: 'ws-dw',
    key: 'agent:state',
    value: { focus: 'mind' },
    category: 'agent_state',
    type: null,
    content: null,
    metadata: null,
    embedding: null,
    createdAt: new Date('2026-06-03T00:00:00.000Z'),
    updatedAt: new Date('2026-06-03T00:00:00.000Z'),
  };

  const originalFlag = process.env.KLOEL_MINDMEMORY_DUALWRITE;

  beforeEach(async () => {
    prisma = {
      kloelMemory: { upsert: jest.fn().mockResolvedValue(legacyRow) },
      mindMemory: { upsert: jest.fn().mockResolvedValue({ ...legacyRow, namespace: 'default' }) },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [MindMemoryItemService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(MindMemoryItemService);
  });

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.KLOEL_MINDMEMORY_DUALWRITE;
    } else {
      process.env.KLOEL_MINDMEMORY_DUALWRITE = originalFlag;
    }
    jest.restoreAllMocks();
  });

  it('flag OFF (unset) → only the legacy KloelMemory write fires', async () => {
    delete process.env.KLOEL_MINDMEMORY_DUALWRITE;

    const result = await service.upsert('ws-dw', 'agent:state', {
      value: { focus: 'mind' },
      category: 'agent_state',
    });

    expect(prisma.kloelMemory.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.mindMemory.upsert).not.toHaveBeenCalled();
    expect(result).toBe(legacyRow);
  });

  it("flag OFF (value !== 'true') → only the legacy KloelMemory write fires", async () => {
    process.env.KLOEL_MINDMEMORY_DUALWRITE = 'false';

    await service.upsert('ws-dw', 'agent:state', { value: { focus: 'mind' } });

    expect(prisma.kloelMemory.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.mindMemory.upsert).not.toHaveBeenCalled();
  });

  it('flag ON → BOTH writes fire; mindMemory gets the mapped record', async () => {
    process.env.KLOEL_MINDMEMORY_DUALWRITE = 'true';

    const result = await service.upsert('ws-dw', 'agent:state', {
      value: { focus: 'mind' },
      category: 'agent_state',
    });

    // Legacy write kept EXACTLY as-is, and its result is what we return.
    expect(prisma.kloelMemory.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.kloelMemory.upsert).toHaveBeenCalledWith({
      where: { workspaceId_key: { workspaceId: 'ws-dw', key: 'agent:state' } },
      create: {
        workspaceId: 'ws-dw',
        key: 'agent:state',
        value: { focus: 'mind' },
        category: 'agent_state',
        type: undefined,
        content: undefined,
      },
      update: {
        value: { focus: 'mind' },
        category: 'agent_state',
        type: undefined,
        content: undefined,
      },
    });

    // Canonical dual-write with the same mapped record + namespace default.
    expect(prisma.mindMemory.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.mindMemory.upsert).toHaveBeenCalledWith({
      where: {
        workspaceId_namespace_key: {
          workspaceId: 'ws-dw',
          namespace: 'default',
          key: 'agent:state',
        },
      },
      create: {
        workspaceId: 'ws-dw',
        key: 'agent:state',
        value: { focus: 'mind' },
        category: 'agent_state',
        type: undefined,
        content: undefined,
      },
      update: {
        value: { focus: 'mind' },
        category: 'agent_state',
        type: undefined,
        content: undefined,
      },
    });

    expect(result).toBe(legacyRow);
  });

  it('flag ON + dual-write throws → legacy result still returned, error swallowed with warn-log', async () => {
    process.env.KLOEL_MINDMEMORY_DUALWRITE = 'true';
    prisma.mindMemory.upsert.mockRejectedValue(new Error('canonical table down'));
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    const result = await service.upsert('ws-dw', 'agent:state', { value: { focus: 'mind' } });

    expect(prisma.kloelMemory.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.mindMemory.upsert).toHaveBeenCalledTimes(1);
    expect(result).toBe(legacyRow);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0]?.[0] ?? '')).toContain('canonical table down');
  });
});
