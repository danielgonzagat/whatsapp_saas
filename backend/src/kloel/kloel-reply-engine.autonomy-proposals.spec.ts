import { buildKloelAbiCognitiveState } from './kloel-reply-engine.cognitive-state.helpers';
import type { PrismaService } from '../prisma/prisma.service';
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
