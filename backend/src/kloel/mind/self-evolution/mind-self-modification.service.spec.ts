import { MindSelfModificationService } from './mind-self-modification.service';

describe('MindSelfModificationService', () => {
  it('proposes optimization opportunities grouped by recurrent high-surprise predicate', async () => {
    const prisma = {
      mindPrediction: {
        findMany: jest.fn().mockResolvedValue([
          { predicate: 'P(reply|template,hour)', surprise: 2.1 },
          { predicate: 'P(reply|template,hour)', surprise: 1.8 },
          { predicate: 'P(reply|template,hour)', surprise: 2.5 },
          { predicate: 'P(convert|channel)', surprise: 0.9 },
          { predicate: 'P(convert|channel)', surprise: 1.1 },
        ]),
      },
    };
    const spine = { emit: jest.fn().mockResolvedValue(undefined) };

    const service = new MindSelfModificationService(prisma as never, spine as never);
    const proposal = await service.proposeOptimization('ws-1');

    expect(proposal.opportunities.length).toBeGreaterThan(0);
    const recurrent = proposal.opportunities.find(
      (o) => o.kind === 'predicate-recurrent-miss',
    );
    expect(recurrent).toBeDefined();
    expect(recurrent?.estimatedImpact).toBe('high');
    expect(recurrent?.rationale).toContain('P(reply|template,hour)');

    const args = prisma.mindPrediction.findMany.mock.calls[0]?.[0] as {
      where?: { workspaceId?: string; surprise?: { gt?: number } };
    };
    expect(args?.where?.workspaceId).toBe('ws-1');
    expect(args?.where?.surprise?.gt).toBe(0.7);

    // emit goes through spine when called
    await service.emitSelfModificationProposal('ws-1', proposal);
    expect(spine.emit).toHaveBeenCalledTimes(1);
    const emitArg = spine.emit.mock.calls[0]?.[0] as {
      eventName?: string;
      workspaceId?: string;
      truthMode?: string;
    };
    expect(emitArg?.eventName).toBe('cognition.self.modification_proposed');
    expect(emitArg?.workspaceId).toBe('ws-1');
    expect(emitArg?.truthMode).toBe('inferred');
  });

  it('returns empty opportunities on empty workspaceId and never queries prisma', async () => {
    const prisma = { mindPrediction: { findMany: jest.fn() } };
    const spine = { emit: jest.fn() };

    const service = new MindSelfModificationService(prisma as never, spine as never);
    const proposal = await service.proposeOptimization('');

    expect(proposal.opportunities).toEqual([]);
    expect(prisma.mindPrediction.findMany).not.toHaveBeenCalled();

    // emit no-ops gracefully when spine unavailable
    const serviceNoSpine = new MindSelfModificationService(prisma as never);
    await expect(
      serviceNoSpine.emitSelfModificationProposal('ws-1', { opportunities: [] }),
    ).resolves.toBeUndefined();
    expect(spine.emit).not.toHaveBeenCalled();
  });
});
