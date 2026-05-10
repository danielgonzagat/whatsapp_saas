import { CommercialDecisionOrchestratorService } from './commercial-decision-orchestrator.service';

describe('CommercialDecisionOrchestratorService', () => {
  const mind = {
    resolveAggressiveness: jest.fn(),
    resolveAudioVsText: jest.fn(),
    resolveChannelChoice: jest.fn(),
    resolveCoupon: jest.fn(),
    resolveHumanTransfer: jest.fn(),
    resolveMessageFormat: jest.fn(),
    resolveObjectionResponse: jest.fn(),
    resolveProductOffer: jest.fn(),
    resolveTone: jest.fn(),
    retrieveSimilar: jest.fn(),
  };
  const concepts = { detect: jest.fn() };
  const events = { recordCommercial: jest.fn() };
  const setup = { getState: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    mind.retrieveSimilar.mockResolvedValue([{ id: 'case-1' }]);
    mind.resolveAudioVsText.mockResolvedValue({ choice: 'text', confidence: 0.7, fallback: false });
    mind.resolveTone.mockResolvedValue({ tone: 'CONSULTIVE', confidence: 0.8, fallback: false });
    mind.resolveAggressiveness.mockResolvedValue({
      aggressiveness: 'MEDIUM',
      confidence: 0.75,
      fallback: false,
    });
    mind.resolveMessageFormat.mockResolvedValue({
      format: 'text',
      confidence: 0.65,
      fallback: false,
    });
    mind.resolveChannelChoice.mockResolvedValue({
      channel: 'whatsapp',
      confidence: 0.7,
      fallback: false,
    });
    mind.resolveCoupon.mockResolvedValue({ action: 'coupon_10', confidence: 0.6, fallback: false });
    mind.resolveObjectionResponse.mockResolvedValue({
      strategy: 'value_focus',
      confidence: 0.68,
      fallback: false,
    });
    mind.resolveProductOffer.mockResolvedValue({
      offer: 'top_seller',
      confidence: 0.72,
      fallback: false,
    });
    mind.resolveHumanTransfer.mockResolvedValue({
      action: 'transfer_now',
      confidence: 0.74,
      fallback: false,
    });
    events.recordCommercial.mockResolvedValue(undefined);
    setup.getState.mockResolvedValue({
      arsenal: [{ id: 'asset-1' }],
      config: { tone: 'direto' },
      selectedProductIds: ['product-1'],
    });
  });

  it('builds predecided actions after detecting concepts and consulting case memory', async () => {
    concepts.detect.mockResolvedValue([{ concept: 'price_objection', confidence: 0.8 }]);
    const service = new CommercialDecisionOrchestratorService(
      mind as never,
      concepts as never,
      events as never,
      setup as never,
    );

    const decision = await service.orchestrateInbound({
      workspaceId: 'ws-1',
      contactId: 'contact-1',
      channel: 'WHATSAPP',
      message: 'Achei caro, tem desconto?',
    });

    expect(concepts.detect).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        subject: 'contact:contact-1',
        features: { channel: 'whatsapp', source: 'omnichannel_inbound' },
      }),
    );
    expect(mind.retrieveSimilar).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        caseType: 'price_objection',
      }),
    );
    expect(mind.resolveAudioVsText).toHaveBeenCalledWith('ws-1', 'whatsapp', 0.05);
    expect(mind.resolveCoupon).toHaveBeenCalledWith('ws-1', 'over_300', 0.05, 'price_objection');
    expect(decision.actions).toEqual([
      {
        tool: 'apply_discount',
        args: expect.objectContaining({
          couponDecision: expect.objectContaining({ action: 'coupon_10' }),
          discountPercent: 10,
          productOffer: undefined,
          segment: 'price_objection',
        }),
      },
    ]);
    expect(events.recordCommercial).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'case_memory.consulted' }),
    );
    expect(events.recordCommercial).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'predecided_actions.built' }),
    );
  });

  it('proactively delegates product and transfer decisions from inbound concepts', async () => {
    concepts.detect.mockResolvedValue([
      { concept: 'imminent_purchase', confidence: 0.9 },
      { concept: 'trust_objection', confidence: 0.7 },
    ]);
    const service = new CommercialDecisionOrchestratorService(
      mind as never,
      concepts as never,
      events as never,
      setup as never,
    );

    await service.orchestrateInbound({
      workspaceId: 'ws-1',
      contactId: 'contact-1',
      channel: 'INSTAGRAM',
      message: 'Quero finalizar, mas preciso confiar.',
    });

    expect(mind.resolveProductOffer).toHaveBeenCalledWith(
      'ws-1',
      'new_lead',
      'imminent_purchase',
      'unknown',
    );
    expect(mind.resolveHumanTransfer).toHaveBeenCalledWith(
      'ws-1',
      'instagram',
      'trust_objection',
      0.7,
    );
  });
});
