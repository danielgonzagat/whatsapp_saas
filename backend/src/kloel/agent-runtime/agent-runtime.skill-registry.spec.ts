import { AgentRuntimeSkillRegistry } from './agent-runtime.skill-registry';
import type { AgentSkillDefinition } from './agent-runtime.types';

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    kloelMemory: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
      ...overrides,
    },
  };
}

function makeSkill(overrides: Partial<AgentSkillDefinition> = {}): AgentSkillDefinition {
  return {
    id: 'checkout-recovery',
    title: 'Checkout Recovery',
    summary: 'Recover checkout with governed follow-up.',
    category: 'commercial',
    riskLevel: 'normal',
    allowedTools: ['list_products'],
    requiredEvidence: ['lead_status'],
    validation: ['workspace_isolation'],
    rollback: ['cancel_scheduled_followup_if_requested'],
    metrics: ['conversion_rate'],
    body: 'Use observed lead and product facts before sending a payment link.',
    version: 1,
    updatedAt: '2026-05-13T00:00:00.000Z',
    ...overrides,
  };
}

describe('AgentRuntimeSkillRegistry', () => {
  it('creates a governed procedural skill with version metadata', async () => {
    const prisma = makePrisma();
    const registry = new AgentRuntimeSkillRegistry(prisma as never);

    const result = await registry.upsertSkill('ws_1', makeSkill());

    expect(result).toEqual({ ok: true, reasons: [], version: 1 });
    expect(prisma.kloelMemory.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId_key: { workspaceId: 'ws_1', key: 'agent_skill:checkout-recovery' },
        },
      }),
    );
    expect(prisma.kloelMemory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          category: 'agent_skill',
          type: 'commercial',
          metadata: expect.objectContaining({
            kind: 'agent_skill',
            version: 1,
            previousVersion: null,
          }),
          content: expect.stringContaining('validation=workspace_isolation'),
        }),
      }),
    );
  });

  it('increments skill versions when updating an existing skill', async () => {
    const existing = makeSkill({ version: 3 });
    const prisma = makePrisma({
      findUnique: jest.fn().mockResolvedValue({ value: existing }),
    });
    const registry = new AgentRuntimeSkillRegistry(prisma as never);

    const result = await registry.upsertSkill('ws_1', makeSkill({ summary: 'Updated procedure' }));

    expect(result.version).toBe(4);
    expect(prisma.kloelMemory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          value: expect.objectContaining({
            version: 4,
            summary: 'Updated procedure',
          }),
          metadata: expect.objectContaining({
            version: 4,
            previousVersion: 3,
          }),
        }),
      }),
    );
  });

  it('rejects unsafe or malformed procedural skills before persistence', async () => {
    const prisma = makePrisma();
    const registry = new AgentRuntimeSkillRegistry(prisma as never);

    const result = await registry.upsertSkill(
      'ws_1',
      makeSkill({
        id: '../escape',
        riskLevel: 'critical',
        validation: [],
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining(['invalid_skill_id', 'critical_skill_requires_validation']),
    );
    expect(prisma.kloelMemory.upsert).not.toHaveBeenCalled();
  });

  it('merges stored skills over bundled defaults when selecting skills', async () => {
    const stored = makeSkill({
      id: 'objection-handling',
      summary: 'Workspace-specific objection handling',
      body: 'pricing objection discount limit',
    });
    const prisma = makePrisma({
      findMany: jest.fn().mockResolvedValue([{ value: stored }]),
    });
    const registry = new AgentRuntimeSkillRegistry(prisma as never);

    const result = await registry.selectSkills('ws_1', 'pricing objection discount', 3);

    expect(result[0].skill.id).toBe('objection-handling');
    expect(result[0].skill.summary).toBe('Workspace-specific objection handling');
  });
});
