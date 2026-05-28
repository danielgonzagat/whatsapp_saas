import { MindPolicyService } from './mind-policy.service';
import { buildPrisma } from './mind-policy.service.spec-helpers';

describe('MindPolicyService — confirmAutopilotOutcome', () => {
  it('marks resolved autopilot actions inside the response window as confirmed', async () => {
    const resolvedAt = new Date(Date.now() - 10 * 60 * 1000);
    const prisma = buildPrisma();
    prisma.mindPolicy.findMany.mockResolvedValue([
      { id: 'policy-1', context: { source: 'autopilot' }, resolvedAt },
    ]);
    const service = new MindPolicyService(prisma as never, { getOrInit: jest.fn() } as never);

    const result = await service.confirmAutopilotOutcome({
      workspaceId: 'ws-1',
      contactId: 'lead-1',
    });

    expect(result).toEqual({ confirmed: 1, unanswered: 0 });
    expect(prisma.mindPolicy.findMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'ws-1',
        subject: 'contact:lead-1',
        decisionType: 'autopilot_action',
        outcome: 1,
        resolvedAt: { not: null },
      },
      select: { id: true, context: true, resolvedAt: true },
    });
    expect(prisma.mindPolicy.update).toHaveBeenCalledWith({
      where: { id: 'policy-1' },
      data: { context: { source: 'autopilot', outcomeConfidence: 'confirmed' } },
    });
  });

  it('skips rows that already have outcome confidence', async () => {
    const prisma = buildPrisma();
    prisma.mindPolicy.findMany.mockResolvedValue([
      {
        id: 'policy-1',
        context: { outcomeConfidence: 'confirmed' },
        resolvedAt: new Date(Date.now() - 10 * 60 * 1000),
      },
    ]);
    const service = new MindPolicyService(prisma as never, { getOrInit: jest.fn() } as never);

    const result = await service.confirmAutopilotOutcome({
      workspaceId: 'ws-1',
      contactId: 'lead-1',
    });

    expect(result).toEqual({ confirmed: 0, unanswered: 0 });
    expect(prisma.mindPolicy.update).not.toHaveBeenCalled();
  });
});
