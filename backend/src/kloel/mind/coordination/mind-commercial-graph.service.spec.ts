import { BrainCommercialGraphService } from './brain-commercial-graph.service';

describe('BrainCommercialGraphService', () => {
  it('builds a weighted commercial graph from workspace events', async () => {
    const prisma = {
      mindBelief: {
        findMany: jest.fn().mockResolvedValue([
          {
            subject: 'contact:contact-1',
            predicate: 'P(reply|template,hour,channel)',
            context: { template: 'audio', hour: 20, channel: 'whatsapp' },
            mean: 0.75,
            variance: 0.04,
            samples: 8,
          },
        ]),
      },
      mindPolicy: {
        findMany: jest.fn().mockResolvedValue([
          {
            subject: 'contact:contact-1',
            decisionType: 'followup_timing',
            chosen: 'short',
            baseline: 'medium',
            outcome: 1,
          },
        ]),
      },
      autopilotEvent: {
        findMany: jest.fn().mockResolvedValue([
          {
            action: 'brain.decide',
            contactId: 'contact-1',
            createdAt: new Date('2026-05-06T10:00:00.000Z'),
            intent: 'user_message',
            status: 'executed',
          },
          {
            action: 'brain.decide',
            contactId: 'contact-1',
            createdAt: new Date('2026-05-06T10:05:00.000Z'),
            intent: 'user_message',
            status: 'executed',
          },
        ]),
      },
      $transaction: jest.fn((queries: Array<Promise<unknown>>) => Promise.all(queries)),
    };
    const service = new BrainCommercialGraphService(prisma as never);

    const graph = await service.buildWorkspaceGraph('ws-1');

    expect(prisma.autopilotEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'ws-1' },
        take: 500,
      }),
    );
    expect(graph.window).toEqual({
      beliefCount: 1,
      eventCount: 2,
      policyCount: 1,
      take: 500,
    });
    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'intent:user_message', weight: 2 }),
        expect.objectContaining({ id: 'action:brain.decide', weight: 2 }),
        expect.objectContaining({ id: 'contact:contact-1', kind: 'contact' }),
        expect.objectContaining({ kind: 'belief' }),
        expect.objectContaining({ id: 'policy:followup_timing:short', kind: 'policy' }),
      ]),
    );
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: 'intent:user_message',
          label: 'triggered',
          to: 'action:brain.decide',
          weight: 2,
        }),
      ]),
    );
  });

  it('uses negative edge weight for failed outcomes', async () => {
    const prisma = {
      mindBelief: { findMany: jest.fn().mockResolvedValue([]) },
      mindPolicy: { findMany: jest.fn().mockResolvedValue([]) },
      autopilotEvent: {
        findMany: jest.fn().mockResolvedValue([
          {
            action: 'send_message',
            contactId: 'contact-1',
            createdAt: new Date('2026-05-06T10:00:00.000Z'),
            intent: 'user_message',
            status: 'failed',
          },
        ]),
      },
      $transaction: jest.fn((queries: Array<Promise<unknown>>) => Promise.all(queries)),
    };
    const service = new BrainCommercialGraphService(prisma as never);

    const graph = await service.buildWorkspaceGraph('ws-1');

    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: 'intent:user_message',
          label: 'triggered',
          to: 'action:send_message',
          weight: -1,
        }),
      ]),
    );
  });

  it('recommends fixes before scaling strong paths', async () => {
    const prisma = {
      mindPolicy: { findMany: jest.fn().mockResolvedValue([]) },
      autopilotEvent: {
        findMany: jest.fn().mockResolvedValue([
          { action: 'send_message', status: 'error' },
          { action: 'send_message', status: 'failed' },
          { action: 'brain.decide', status: 'executed' },
          { action: 'brain.decide', status: 'executed' },
        ]),
      },
      $transaction: jest.fn((queries: Array<Promise<unknown>>) => Promise.all(queries)),
    };
    const service = new BrainCommercialGraphService(prisma as never);

    const result = await service.recommendNextActions('ws-1');

    expect(result.recommendations[0]).toEqual(
      expect.objectContaining({
        action: 'send_message',
        confidence: 0,
      }),
    );
    expect(result.recommendations[0]?.reason).toContain('Priorizar correção');
  });

  it('prioritizes toxic or regressive policy outcomes before healthy scaling', async () => {
    const prisma = {
      mindPolicy: {
        findMany: jest.fn().mockResolvedValue([
          {
            decisionType: 'post_sale_offer',
            chosen: 'upsell_after_refund_risk',
            outcome: -0.4,
            baselineOutcome: 0.2,
          },
          {
            decisionType: 'objection_response',
            chosen: 'send_message',
            outcome: 0.7,
            baselineOutcome: 0.3,
          },
        ]),
      },
      autopilotEvent: {
        findMany: jest.fn().mockResolvedValue([
          { action: 'send_message', status: 'executed' },
          { action: 'send_message', status: 'executed' },
          { action: 'upsell_after_refund_risk', status: 'completed' },
        ]),
      },
      $transaction: jest.fn((queries: Array<Promise<unknown>>) => Promise.all(queries)),
    };
    const service = new BrainCommercialGraphService(prisma as never);

    const result = await service.recommendNextActions('ws-1');

    expect(result.recommendations[0]).toEqual(
      expect.objectContaining({
        action: 'upsell_after_refund_risk',
        confidence: 0.35,
        toxicityFlag: 'regression',
        toxicPolicyCount: 1,
      }),
    );
    expect(result.recommendations[0]?.reason).toContain('toxicidade detectada');
    expect(result.recommendations.find((r) => r.action === 'send_message')).toEqual(
      expect.objectContaining({
        confidence: 1,
        toxicityFlag: 'healthy',
      }),
    );
  });
});
