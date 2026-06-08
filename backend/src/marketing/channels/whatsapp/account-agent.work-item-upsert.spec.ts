import { upsertWorkItem, type WorkItemInput } from './account-agent.work-item-upsert';

function makeWorkItemInput(overrides: Partial<WorkItemInput> = {}): WorkItemInput {
  return {
    approvalState: null,
    blockedBy: null,
    entityId: 'catalog_gap',
    entityType: 'capability',
    evidence: { reason: 'test' },
    inputState: null,
    kind: 'capability_gap',
    metadata: { capabilityCode: 'catalog_gap' },
    priority: 80,
    requiresApproval: false,
    requiresInput: true,
    state: 'OPEN',
    summary: 'Catalog needs configuration',
    title: 'Configure catalog capability',
    utility: 0.8,
    ...overrides,
  };
}

describe('upsertWorkItem', () => {
  it('uses Prisma upsert instead of a create race for missing work items', async () => {
    const agentWorkItem = {
      create: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      upsert: jest.fn().mockResolvedValue({}),
    };
    const agentEvents = { publish: jest.fn().mockResolvedValue(undefined) };

    await upsertWorkItem(
      { prisma: { agentWorkItem } as never, agentEvents: agentEvents as never },
      'workspace-1',
      makeWorkItemInput(),
    );

    expect(agentWorkItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'workspace-1:capability_gap:capability:catalog_gap' },
      }),
    );
    expect(agentWorkItem.create).not.toHaveBeenCalled();
    expect(agentWorkItem.updateMany).not.toHaveBeenCalled();
  });
});
