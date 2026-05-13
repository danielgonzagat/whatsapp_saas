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
  const identity = {
    resolve: jest.fn(),
  };
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
    identity.resolve.mockResolvedValue({
      contactId: 'contact-1',
      channelIdentifierId: 'ci-1',
      wasCreated: false,
      wasResolved: false,
    });
    setup.getState.mockResolvedValue({
      arsenal: [{ id: 'asset-1', type: 'text' }, { id: 'asset-2', type: 'image' }],
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
      identity as never,
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

  it('attaches hierarchyJustification to every decision in the trace', async () => {
    concepts.detect.mockResolvedValue([
      { concept: 'imminent_purchase', confidence: 0.9 },
      { concept: 'trust_objection', confidence: 0.7 },
    ]);
    const service = makeService();

    const decision = await service.orchestrateInbound({
      workspaceId: 'ws-1',
      contactId: 'contact-1',
      channel: 'WHATSAPP',
      message: 'Quero comprar, mas confio pouco.',
    });

    const trace = decision.trace as Record<string, unknown>;
    const decisions = trace.decisions as Record<string, Record<string, unknown>>;
    expect(decisions).toBeTruthy();

    const decisionKeys = [
      'audio_vs_text',
      'channel_choice',
      'message_format',
      'tom',
      'cia_aggressiveness',
      'product_offer',
      'human_transfer',
    ];

    for (const key of decisionKeys) {
      const entry = decisions[key];
      expect(entry).toBeTruthy();
      const justification = entry.hierarchyJustification as Record<string, unknown> | undefined;
      expect(justification).toBeTruthy();
      expect(justification!.level).toBeDefined();
      expect(typeof justification!.reason).toBe('string');
      expect((justification!.reason as string).length).toBeGreaterThan(0);
    }

    const eventCall = events.recordCommercial.mock.calls.find(
      (call: Array<{ eventType: string }>) => call[0]?.eventType === 'predecided_actions.built',
    );
    expect(eventCall).toBeTruthy();
    const payload = eventCall[0].payload as Record<string, unknown>;
    const payloadDecisions = payload.decisions as Record<string, Record<string, unknown>>;
    for (const key of decisionKeys) {
      const entry = payloadDecisions[key];
      expect(entry).toBeTruthy();
      expect(entry.hierarchyJustification).toBeTruthy();
    }
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

  // ─── P1.4 — Arsenal-aware format tests ───

  it('filters resolveMessageFormat candidates to arsenal-owned formats', async () => {
    setup.getState.mockResolvedValue({
      arsenal: [{ id: 'a1', type: 'text' }, { id: 'a2', type: 'image' }],
      config: { tone: 'direto' },
      selectedProductIds: ['product-1'],
    });
    concepts.detect.mockResolvedValue([{ concept: 'general', confidence: 0.9 }]);
    const service = makeService();

    await service.orchestrateInbound({
      workspaceId: 'ws-1',
      channel: 'whatsapp',
      message: 'Olá',
    });

    expect(mind.resolveMessageFormat).toHaveBeenCalledWith(
      'ws-1',
      'whatsapp',
      'general',
      ['text', 'image'],
    );
  });

  it('removes audio from format candidates when zero audio assets uploaded', async () => {
    setup.getState.mockResolvedValue({
      arsenal: [{ id: 'a1', type: 'text' }],
      config: { tone: 'direto' },
      selectedProductIds: ['product-1'],
    });
    concepts.detect.mockResolvedValue([{ concept: 'general', confidence: 0.9 }]);
    const service = makeService();

    const decision = await service.orchestrateInbound({
      workspaceId: 'ws-1',
      channel: 'whatsapp',
      message: 'Olá',
    });

    const formatsArg = (mind.resolveMessageFormat as jest.Mock).mock.calls[0][3];
    expect(formatsArg).not.toContain('audio');
    expect(formatsArg).not.toContain('video');
    expect(formatsArg).not.toContain('document');
    expect(formatsArg).not.toContain('template');
    expect(formatsArg).toEqual(['text']);

    const trace = decision.trace as Record<string, unknown>;
    const decisions = trace.decisions as Record<string, unknown>;
    expect(decisions.arsenal_format_filter).toBeDefined();
  });

  it('records arsenal-empty-for-format when formats are pruned by upload count', async () => {
    setup.getState.mockResolvedValue({
      arsenal: [],
      config: { tone: 'direto' },
      selectedProductIds: ['product-1'],
    });
    concepts.detect.mockResolvedValue([{ concept: 'general', confidence: 0.9 }]);
    const service = makeService();

    const decision = await service.orchestrateInbound({
      workspaceId: 'ws-1',
      channel: 'whatsapp',
      message: 'Olá',
    });

    const trace = decision.trace as Record<string, unknown>;
    const decisions = trace.decisions as Record<string, unknown>;
    const filter = decisions.arsenal_format_filter as Record<string, unknown>;
    expect(filter).toBeDefined();
    expect(filter.reason).toBe('arsenal-empty-for-format');
    expect(filter.channel_allowed).toContain('audio');
    expect(filter.arsenal_present).toEqual([]);
  });

  it('preserves format candidates when arsenal covers all channel formats', async () => {
    setup.getState.mockResolvedValue({
      arsenal: [
        { id: 'a1', type: 'text' },
        { id: 'a2', type: 'audio' },
        { id: 'a3', type: 'image' },
        { id: 'a4', type: 'video' },
        { id: 'a5', type: 'document' },
        { id: 'a6', type: 'template' },
      ],
      config: { tone: 'direto' },
      selectedProductIds: ['product-1'],
    });
    concepts.detect.mockResolvedValue([{ concept: 'general', confidence: 0.9 }]);
    const service = makeService();

    await service.orchestrateInbound({
      workspaceId: 'ws-1',
      channel: 'whatsapp',
      message: 'Olá',
    });

    const formatsArg = (mind.resolveMessageFormat as jest.Mock).mock.calls[0][3];
    expect(formatsArg).toContain('text');
    expect(formatsArg).toContain('audio');
    expect(formatsArg).toContain('image');
    expect(formatsArg).toContain('video');
    expect(formatsArg).toContain('document');
    expect(formatsArg).toContain('template');
  });

  it('uses full allowedFormats when arsenal is null/empty (no setup)', async () => {
    setup.getState.mockResolvedValue(null);
    concepts.detect.mockResolvedValue([{ concept: 'general', confidence: 0.9 }]);
    const service = makeService();

    await service.orchestrateInbound({
      workspaceId: 'ws-1',
      channel: 'whatsapp',
      message: 'Olá',
    });

    const formatsArg = (mind.resolveMessageFormat as jest.Mock).mock.calls[0][3];
    expect(formatsArg).toContain('audio');
    expect(formatsArg).toContain('image');
  });
});
