import { StateBuilderService } from './state-builder.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { CapabilityRegistryV2Service } from '../capability-registry-v2/capability-registry-v2.service';
import type { MindMessageService } from '../mind/aliases/mind-message.service';

/**
 * Proves the StateBuilder assembles ConversationState from REAL sources
 * (each field maps to a concrete Prisma model / registry call), and that
 * absent sources are reported honestly in missingSources rather than faked.
 */
// Types the mock delegate methods we assert on as plain jest.Mock functions
// (not bound Prisma class methods), so expect(prisma.x.findUnique) reads a
// standalone mock — satisfying @typescript-eslint/unbound-method without
// changing any assertion semantics.
type MockedPrisma = PrismaService & {
  workspace: { findUnique: jest.Mock };
  agent: { findFirst: jest.Mock };
  auditLog: { findMany: jest.Mock };
  kloelMessage: { findMany: jest.Mock };
};
type MockedCaps = CapabilityRegistryV2Service & { filterFor: jest.Mock };

describe('StateBuilderService', () => {
  const buildPrisma = (overrides: Record<string, unknown> = {}): MockedPrisma =>
    ({
      workspace: {
        findUnique: jest.fn().mockResolvedValue({ id: 'ws1', name: 'Acme' }),
      },
      agent: {
        findFirst: jest.fn().mockResolvedValue({ id: 'u1', name: 'Dani', role: 'ADMIN' }),
      },
      contact: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'c1',
          name: 'Lead',
          phone: '+5511999',
          leadScore: 80,
          sentiment: 'positive',
          purchaseProbability: 'high',
        }),
      },
      auditLog: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { action: 'create', resource: 'product', resourceId: 'p1', createdAt: new Date() },
          ]),
      },
      kloelMessage: {
        // Builder queries orderBy createdAt desc (newest-first) then reverses to
        // oldest-first for prompt assembly, so the mock must echo desc order.
        findMany: jest.fn().mockResolvedValue([
          { role: 'assistant', content: 'ola', createdAt: new Date(2) },
          { role: 'user', content: 'oi', createdAt: new Date(1) },
        ]),
      },
      ...overrides,
    }) as unknown as MockedPrisma;

  const buildCaps = (): MockedCaps =>
    ({
      filterFor: jest.fn().mockReturnValue([{ id: 'cap.a' }, { id: 'cap.b' }]),
    }) as unknown as MockedCaps;

  // MindMessageService.items returns the SAME prisma.kloelMessage delegate the
  // builder reads short-term memory from, so the prisma.kloelMessage.findMany
  // assertions below remain exactly valid after the Brain → Mind migration.
  const buildMind = (prisma: PrismaService) =>
    ({ items: prisma.kloelMessage }) as unknown as MindMessageService;

  it('assembles every field from its real source', async () => {
    const prisma = buildPrisma();
    const caps = buildCaps();
    const builder = new StateBuilderService(prisma, caps, buildMind(prisma));

    const state = await builder.build({
      workspaceId: 'ws1',
      userId: 'u1',
      contactPhone: '+5511999',
      surface: 'chat',
      permissions: ['perm.x'],
    });

    // workspace ← prisma.workspace
    expect(prisma.workspace.findUnique).toHaveBeenCalledWith({
      where: { id: 'ws1' },
      select: { id: true, name: true },
    });
    expect(state.workspace).toEqual({ id: 'ws1', name: 'Acme', context: '' });

    // actor ← prisma.agent
    expect(prisma.agent.findFirst).toHaveBeenCalled();
    expect(state.actor).toEqual({ id: 'u1', name: 'Dani', role: 'ADMIN' });

    // contact ← prisma.contact
    expect(state.contact?.id).toBe('c1');
    expect(state.contact?.leadScore).toBe(80);

    // recentEvents ← prisma.auditLog (tail, last 24h)
    expect(prisma.auditLog.findMany).toHaveBeenCalled();
    expect(state.recentEvents).toHaveLength(1);
    expect(state.recentEvents[0]?.action).toBe('create');

    // memory.shortTerm ← prisma.kloelMessage (chronological)
    expect(prisma.kloelMessage.findMany).toHaveBeenCalled();
    expect(state.memory.shortTerm.map((m) => m.content)).toEqual(['oi', 'ola']);

    // capabilities ← CapabilityRegistryV2Service.filterFor
    expect(caps.filterFor).toHaveBeenCalledWith({
      surface: 'chat',
      permissions: ['perm.x'],
    });
    expect(state.capabilities).toHaveLength(2);

    // risk ← honestly flagged unavailable (no per-workspace RiskService)
    expect(state.risk.available).toBe(false);
    expect(state.missingSources).toContain('risk:no-per-workspace-risk-service');
  });

  it('reports missing sources instead of faking them', async () => {
    const prisma = buildPrisma({
      workspace: { findUnique: jest.fn().mockResolvedValue(null) },
    });
    const builder = new StateBuilderService(prisma, buildCaps(), buildMind(prisma));

    const state = await builder.build({});

    expect(state.workspace).toBeNull();
    expect(state.actor).toBeNull();
    expect(state.recentEvents).toEqual([]);
    expect(state.memory.shortTerm).toEqual([]);
    expect(state.missingSources).toEqual(
      expect.arrayContaining(['workspace:no-workspaceId', 'actor:no-userId']),
    );
  });

  it('orders short-term memory oldest-first for prompt assembly', async () => {
    const prisma = buildPrisma({
      kloelMessage: {
        findMany: jest.fn().mockResolvedValue([
          { role: 'assistant', content: 'newest', createdAt: new Date(3) },
          { role: 'user', content: 'oldest', createdAt: new Date(1) },
        ]),
      },
    });
    const builder = new StateBuilderService(prisma, buildCaps(), buildMind(prisma));

    const state = await builder.build({ workspaceId: 'ws1' });

    expect(state.memory.shortTerm.map((m) => m.content)).toEqual(['oldest', 'newest']);
  });
});
