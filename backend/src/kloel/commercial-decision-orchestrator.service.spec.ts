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
  const prisma = {
    pipelineState: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    decisionShadow: {
      upsert: jest.fn(),
      count: jest.fn(),
    },
  };

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
    prisma.pipelineState.findUnique.mockResolvedValue({ state: 'active', fallbackRate1h: 0 });
    prisma.pipelineState.updateMany.mockResolvedValue({ count: 1 });
    prisma.pipelineState.update.mockResolvedValue({ state: 'shadow', fallbackRate1h: 0 });
    prisma.decisionShadow.upsert.mockResolvedValue({ id: 'shadow-1' });
    prisma.decisionShadow.count.mockResolvedValue(0);
  });

  function makeService() {
    return new CommercialDecisionOrchestratorService(
      mind as never,
      concepts as never,
      events as never,
      setup as never,
      prisma as never,
    );
  }

  it('returns empty actions for legacy pipeline state', async () => {
    prisma.pipelineState.findUnique.mockResolvedValue({ state: 'legacy', fallbackRate1h: 0 });
    concepts.detect.mockResolvedValue([{ concept: 'price_objection', confidence: 0.8 }]);
    const service = makeService();

    const decision = await service.orchestrateInbound({
      workspaceId: 'ws-1',
      channel: 'WHATSAPP',
      message: 'Achei caro, tem desconto?',
    });

    expect(decision.actions).toEqual([]);
    expect(decision.concepts).toEqual([]);
    expect(decision.trace).toEqual({
      channel: 'whatsapp',
      pipelineState: 'legacy',
      skipped: true,
      delegatedToLegacy: true,
    });
    expect(mind.resolveAggressiveness).not.toHaveBeenCalled();
  });

  it('returns no actions in shadow mode but records shadow', async () => {
    prisma.pipelineState.findUnique.mockResolvedValue({ state: 'shadow', fallbackRate1h: 0 });
    concepts.detect.mockResolvedValue([{ concept: 'price_objection', confidence: 0.8 }]);
    const service = makeService();

    const decision = await service.orchestrateInbound({
      workspaceId: 'ws-1',
      contactId: 'contact-1',
      channel: 'WHATSAPP',
      message: 'Achei caro, tem desconto?',
    });

    expect(decision.actions).toEqual([]);
    expect(decision.trace.pipelineMode).toBe('shadow');
    expect(decision.trace.shadow).toBe(true);
    expect(prisma.decisionShadow.upsert).toHaveBeenCalled();
    expect(events.recordCommercial).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'pipeline.shadow_recorded' }),
    );
  });

  it('builds predecided actions after detecting concepts and consulting case memory', async () => {
    concepts.detect.mockResolvedValue([{ concept: 'price_objection', confidence: 0.8 }]);
    const service = makeService();

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
    const service = makeService();

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
      undefined,
      expect.objectContaining({ channel: 'instagram' }),
    );
    expect(mind.resolveHumanTransfer).toHaveBeenCalledWith(
      'ws-1',
      'instagram',
      'trust_objection',
      0.7,
    );
  });

  it('auto-fallback transitions active to shadow on persistent failure', async () => {
    prisma.pipelineState.findUnique
      .mockResolvedValueOnce({ state: 'active', fallbackRate1h: 0 })
      .mockResolvedValueOnce({ state: 'active', fallbackRate1h: 0.06 });
    concepts.detect.mockRejectedValue(new Error('simulated crash'));
    const service = makeService();

    await expect(
      service.orchestrateInbound({
        workspaceId: 'ws-1',
        channel: 'whatsapp',
        message: 'test',
      }),
    ).rejects.toThrow('simulated crash');

    expect(prisma.pipelineState.updateMany).toHaveBeenCalledWith({
      where: { workspaceId: 'ws-1' },
      data: { fallbackRate1h: { increment: 0.01 } },
    });
    expect(prisma.pipelineState.update).toHaveBeenCalledWith({
      where: { workspaceId: 'ws-1' },
      data: expect.objectContaining({ state: 'shadow' }),
    });
    expect(events.recordCommercial).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'pipeline.auto_fallback' }),
    );
  });

  it('does not auto-fallback when not in active mode', async () => {
    prisma.pipelineState.findUnique.mockResolvedValue({ state: 'shadow', fallbackRate1h: 0 });
    concepts.detect.mockRejectedValue(new Error('simulated crash'));
    const service = makeService();

    await expect(
      service.orchestrateInbound({
        workspaceId: 'ws-1',
        channel: 'whatsapp',
        message: 'test',
      }),
    ).rejects.toThrow('simulated crash');

    expect(prisma.pipelineState.update).not.toHaveBeenCalled();
  });
});
