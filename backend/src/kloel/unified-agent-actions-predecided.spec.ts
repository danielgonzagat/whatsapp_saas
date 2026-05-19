import { UnifiedAgentActionsCrmService } from './unified-agent-actions-crm.service';
import { UnifiedAgentActionsSalesService } from './unified-agent-actions-sales.service';
import { UnifiedAgentActionsWorkspaceService } from './unified-agent-actions-workspace.service';
import { buildPredecidedActionDraft } from './unified-agent-predecided-actions.part';

describe('Unified agent predecided action execution', () => {
  it('does not describe blocked payment links as sent in the assistant draft', () => {
    const draft = buildPredecidedActionDraft([
      {
        tool: 'create_payment_link',
        args: { amount: 100, productName: 'Produto X' },
        result: {
          blocked: true,
          reason: 'capability_not_allowed',
          riskClass: 'R3',
          approvalRequired: true,
          escalation: 'human_operator_required',
          safeNextStep: 'redirect_to_manual_checkout',
          rollback: 'not_executed',
        },
      },
    ]);

    expect(draft).toContain('não enviado');
    expect(draft).toContain('aprovação humana');
    expect(draft).not.toContain('preparado e enviado');
  });

  it('executes predecided discounts without asking MIND to decide again', async () => {
    const prisma = {
      autopilotEvent: { create: jest.fn().mockResolvedValue({}) },
      kloelMemory: {
        findFirst: jest.fn().mockResolvedValue({
          value: { name: 'Produto', price: 200 },
        }),
      },
    };
    const messaging = { actionSendMessage: jest.fn().mockResolvedValue({ success: true }) };
    const mind = {
      resolveCoupon: jest.fn(),
      resolveProductOffer: jest.fn(),
    };

    const service = new UnifiedAgentActionsSalesService(
      prisma as never,
      messaging as never,
      undefined,
      mind as never,
    );

    await service.actionApplyDiscount(
      'ws-1',
      'contact-1',
      '+5511999999999',
      {
        couponDecision: { action: 'coupon_10', confidence: 0.8 },
        decisionTraceId: 'trace-1',
        discountPercent: 10,
        inboundCorrelationId: 'inbound-1',
        priceBand: 'over_300',
        productOffer: { offer: 'top_seller' },
        segment: 'price_objection',
      },
      { deterministicPipeline: true },
    );

    expect(mind.resolveCoupon).not.toHaveBeenCalled();
    expect(mind.resolveProductOffer).not.toHaveBeenCalled();
    expect(prisma.autopilotEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          meta: expect.objectContaining({
            inboundCorrelationId: 'inbound-1',
            source: 'orchestrator_predecided',
          }),
        }),
      }),
    );
  });

  it('executes predecided human transfers without asking MIND to decide again', async () => {
    const prisma = {
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          contact: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
          conversation: {
            findFirst: jest.fn().mockResolvedValue({ id: 'conversation-1' }),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
        }),
      ),
      autopilotEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const mind = { resolveHumanTransfer: jest.fn() };
    const service = new UnifiedAgentActionsCrmService(
      prisma as never,
      {} as never,
      undefined,
      undefined,
      mind as never,
    );

    const result = await service.actionTransferToHuman(
      'ws-1',
      'contact-1',
      {
        handoffDecision: { action: 'transfer_now', confidence: 0.9 },
        reason: 'alto valor',
      },
      { deterministicPipeline: true },
    );

    expect(mind.resolveHumanTransfer).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        transferred: true,
      }),
    );
  });

  it('executes predecided follow-up timing without asking policy to decide again', async () => {
    const prisma = {
      autopilotEvent: { create: jest.fn().mockResolvedValue({}) },
      followUp: {
        create: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      workspace: {
        findUnique: jest.fn().mockResolvedValue({
          channelIdentifiers: [],
          providerSettings: {},
        }),
      },
    };
    const mindPolicy = { choose: jest.fn() };
    const service = new UnifiedAgentActionsCrmService(
      prisma as never,
      {} as never,
      undefined,
      mindPolicy as never,
    );

    await service.actionScheduleFollowup(
      'ws-1',
      'contact-1',
      '+5511999999999',
      {
        delayHours: 2,
        followupTimingDecision: { chosen: 'medium', outcomeKey: 'followup-1' },
        inboundCorrelationId: 'inbound-1',
        message: 'Volto em breve.',
      },
      { deterministicPipeline: true },
    );

    expect(mindPolicy.choose).not.toHaveBeenCalled();
    const createCall = prisma.followUp.create.mock.calls[0]?.[0];
    expect(createCall?.data?.scheduledFor).toBeInstanceOf(Date);
    expect(prisma.autopilotEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          meta: expect.objectContaining({
            inboundCorrelationId: 'inbound-1',
            source: 'orchestrator_predecided',
          }),
        }),
      }),
    );
  });

  it('executes predecided broadcasts without asking MIND to choose channel or window again', async () => {
    const prisma = {
      contact: { count: jest.fn().mockResolvedValue(12) },
      kloelMemory: { create: jest.fn().mockResolvedValue({}) },
    };
    const mind = {
      resolveBroadcastWindow: jest.fn(),
      resolveChannelChoice: jest.fn(),
    };
    const service = new UnifiedAgentActionsWorkspaceService(
      prisma as never,
      {} as never,
      undefined,
      mind as never,
    );

    const result = await service.actionCreateBroadcast(
      'ws-1',
      {
        broadcastWindow: { window: 'tomorrow_9h', confidence: 0.7 },
        channelChoice: { channel: 'instagram', confidence: 0.8 },
        inboundCorrelationId: 'inbound-1',
        message: 'Campanha aprovada',
        name: 'Campanha MIND',
        stage: 'price_objection',
      },
      { deterministicPipeline: true },
    );

    expect(mind.resolveChannelChoice).not.toHaveBeenCalled();
    expect(mind.resolveBroadcastWindow).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        channel: 'instagram',
        contactCount: 12,
        source: 'orchestrator_predecided',
        success: true,
      }),
    );
  });
});
