import {
  buildKloelAbiCognitiveState,
  readAbiSnapshotCache,
  writeAbiSnapshotCache,
  ABI_SNAPSHOT_KEY,
} from './kloel-reply-engine.cognitive-state.helpers';
import type { PrismaService } from '../prisma/prisma.service';
import type { MindMemoryItemService } from './mind/aliases/mind-memory-item.service';
import type {
  MindAutonomyCoordinator,
  Proposal,
} from './mind/coordination/mind-autonomy-coordinator.service';

const mockWarnCalls: Array<[string, Record<string, unknown>]> = [];

describe('buildKloelAbiCognitiveState — autonomy proposals (PI-K13-D)', () => {
  const baseDeps = {
    prisma: {
      kloelMemory: { findUnique: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService,
    logger: {
      warn: (event: string, ctx?: Record<string, unknown>) => {
        mockWarnCalls.push([event, ctx ?? {}]);
      },
    },
    services: {},
  };

  const baseParams = {
    workspaceId: 'ws-1',
    userMessage: 'Hello',
  };

  const currentInput = {
    raw: 'Hello',
    channel: 'web',
    arrivalTimestamp: new Date().toISOString(),
  };

  const makeProposal = (id: string): Proposal => ({
    id,
    title: `Escalar: ${id}`,
    rationale: `Rationale for ${id}`,
    confidence: 0.8,
    suggestedCapabilityId: id,
  });

  beforeEach(() => {
    mockWarnCalls.length = 0;
  });

  it('attaches proposals when coordinator is present and returns proposals', async () => {
    const proposals = [makeProposal('p1'), makeProposal('p2')];
    const listPendingProposals = jest.fn().mockResolvedValue(proposals);
    const coordinator = { listPendingProposals } as unknown as MindAutonomyCoordinator;

    const state = await buildKloelAbiCognitiveState(
      { ...baseDeps, services: { mindAutonomyCoordinator: coordinator } },
      baseParams,
      currentInput,
    );

    expect(listPendingProposals).toHaveBeenCalledWith('ws-1', 3);
    expect(state.autonomyProposals).toEqual(proposals);
  });

  it('attaches empty array when coordinator returns empty proposals', async () => {
    const listPendingProposals = jest.fn().mockResolvedValue([]);
    const coordinator = { listPendingProposals } as unknown as MindAutonomyCoordinator;

    const state = await buildKloelAbiCognitiveState(
      { ...baseDeps, services: { mindAutonomyCoordinator: coordinator } },
      baseParams,
      currentInput,
    );

    expect(listPendingProposals).toHaveBeenCalledWith('ws-1', 3);
    expect(state.autonomyProposals).toEqual([]);
  });

  it('omits key when coordinator is absent', async () => {
    const state = await buildKloelAbiCognitiveState(
      { ...baseDeps, services: {} },
      baseParams,
      currentInput,
    );

    expect(state).not.toHaveProperty('autonomyProposals');
  });

  it('omits key and logs warning when coordinator throws', async () => {
    const coordinator = {
      listPendingProposals: jest.fn().mockRejectedValue(new Error('graph unavailable')),
    } as unknown as MindAutonomyCoordinator;

    const state = await buildKloelAbiCognitiveState(
      { ...baseDeps, services: { mindAutonomyCoordinator: coordinator } },
      baseParams,
      currentInput,
    );

    expect(state).not.toHaveProperty('autonomyProposals');
    const warning = mockWarnCalls.find(([event]) => event === 'kloel_autonomy_proposals_skipped');
    expect(warning).toBeDefined();
    const warningArg = warning?.[1];
    expect(warningArg).toMatchObject({
      reason: 'graph unavailable',
      workspaceId: 'ws-1',
    });
  });

  it('skips lookup when workspaceId is null', async () => {
    const listPendingProposals = jest.fn();
    const coordinator = { listPendingProposals } as unknown as MindAutonomyCoordinator;

    const state = await buildKloelAbiCognitiveState(
      { ...baseDeps, services: { mindAutonomyCoordinator: coordinator } },
      { ...baseParams, workspaceId: null },
      currentInput,
    );

    expect(listPendingProposals).not.toHaveBeenCalled();
    expect(state).not.toHaveProperty('autonomyProposals');
  });
});

describe('cognitive-state cache — canonical MindMemoryItemService surface', () => {
  const logger = { warn: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('readAbiSnapshotCache routes the findUnique through mindMemory.items when provided', async () => {
    const canonicalFindUnique = jest.fn().mockResolvedValue(null);
    const fallbackFindUnique = jest.fn().mockResolvedValue(null);
    const prisma = {
      kloelMemory: { findUnique: fallbackFindUnique },
    } as unknown as PrismaService;
    const mindMemory = {
      items: { findUnique: canonicalFindUnique },
    } as unknown as MindMemoryItemService;

    await readAbiSnapshotCache(prisma, logger, 'ws-canon', mindMemory);

    // Canonical surface used; raw prisma delegate untouched.
    expect(canonicalFindUnique).toHaveBeenCalledTimes(1);
    expect(fallbackFindUnique).not.toHaveBeenCalled();
    // Byte-identical args preserved.
    expect(canonicalFindUnique).toHaveBeenCalledWith({
      where: { workspaceId_key: { workspaceId: 'ws-canon', key: ABI_SNAPSHOT_KEY } },
    });
  });

  it('readAbiSnapshotCache falls back to prisma.kloelMemory when mindMemory is absent', async () => {
    const fallbackFindUnique = jest.fn().mockResolvedValue(null);
    const prisma = {
      kloelMemory: { findUnique: fallbackFindUnique },
    } as unknown as PrismaService;

    await readAbiSnapshotCache(prisma, logger, 'ws-legacy');

    expect(fallbackFindUnique).toHaveBeenCalledTimes(1);
    expect(fallbackFindUnique).toHaveBeenCalledWith({
      where: { workspaceId_key: { workspaceId: 'ws-legacy', key: ABI_SNAPSHOT_KEY } },
    });
  });

  it('writeAbiSnapshotCache routes the upsert through mindMemory.items with byte-identical args', async () => {
    type CanonicalUpsertArg = {
      where: { workspaceId_key: { workspaceId: string; key: string } };
      update: { content: string; category: string; value: unknown };
      create: {
        workspaceId: string;
        key: string;
        content: string;
        category: string;
        value: unknown;
      };
    };
    const canonicalUpsert = jest.fn<Promise<unknown>, [CanonicalUpsertArg]>().mockResolvedValue({});
    const fallbackUpsert = jest.fn().mockResolvedValue({});
    const prisma = {
      kloelMemory: { upsert: fallbackUpsert },
    } as unknown as PrismaService;
    const mindMemory = {
      items: { upsert: canonicalUpsert },
    } as unknown as MindMemoryItemService;

    const cognitiveState = { abiStatus: 'ok' };
    await writeAbiSnapshotCache(prisma, logger, 'ws-canon', cognitiveState, mindMemory);

    expect(canonicalUpsert).toHaveBeenCalledTimes(1);
    expect(fallbackUpsert).not.toHaveBeenCalled();
    const arg = canonicalUpsert.mock.calls[0][0];
    expect(arg.where).toEqual({
      workspaceId_key: { workspaceId: 'ws-canon', key: ABI_SNAPSHOT_KEY },
    });
    expect(arg.update).toMatchObject({
      content: JSON.stringify(cognitiveState),
      category: 'abi_snapshot',
      value: {},
    });
    expect(arg.create).toMatchObject({
      workspaceId: 'ws-canon',
      key: ABI_SNAPSHOT_KEY,
      content: JSON.stringify(cognitiveState),
      category: 'abi_snapshot',
      value: {},
    });
  });

  it('writeAbiSnapshotCache falls back to prisma.kloelMemory when mindMemory is absent', async () => {
    const fallbackUpsert = jest.fn().mockResolvedValue({});
    const prisma = {
      kloelMemory: { upsert: fallbackUpsert },
    } as unknown as PrismaService;

    await writeAbiSnapshotCache(prisma, logger, 'ws-legacy', { abiStatus: 'ok' });

    expect(fallbackUpsert).toHaveBeenCalledTimes(1);
  });

  it('buildKloelAbiCognitiveState threads deps.mindMemory into the cache read', async () => {
    const canonicalFindUnique = jest.fn().mockResolvedValue(null);
    const canonicalUpsert = jest.fn().mockResolvedValue({});
    const fallbackFindUnique = jest.fn().mockResolvedValue(null);
    const fallbackUpsert = jest.fn().mockResolvedValue({});
    const prisma = {
      kloelMemory: { findUnique: fallbackFindUnique, upsert: fallbackUpsert },
    } as unknown as PrismaService;
    const mindMemory = {
      items: { findUnique: canonicalFindUnique, upsert: canonicalUpsert },
    } as unknown as MindMemoryItemService;

    await buildKloelAbiCognitiveState(
      { prisma, logger, services: {}, mindMemory },
      { workspaceId: 'ws-canon', userMessage: 'Hi' },
      { raw: 'Hi', channel: 'web', arrivalTimestamp: new Date().toISOString() },
    );

    expect(canonicalFindUnique).toHaveBeenCalledTimes(1);
    expect(canonicalUpsert).toHaveBeenCalledTimes(1);
    expect(fallbackFindUnique).not.toHaveBeenCalled();
    expect(fallbackUpsert).not.toHaveBeenCalled();
  });
});
