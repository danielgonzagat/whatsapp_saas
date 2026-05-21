import { KloelComposerService } from './kloel-composer.service';
import { MindGuardsService } from './mind-guards.service';
import { KloelRuleEngineService } from './rules/kloel-rule-engine.service';

describe('code-native MIND guards and composer', () => {
  let engine: KloelRuleEngineService;

  beforeEach(() => {
    engine = new KloelRuleEngineService();
  });

  it('blocks duplicate payment guard when paymentProcessed is true', async () => {
    const prisma = { mindGuardAudit: { create: jest.fn() } };
    const service = new MindGuardsService(prisma as never, engine);

    const result = await service.evaluate({
      workspaceId: 'ws-1',
      decisionType: 'product_offer',
      action: 'send_payment_link',
      context: { paymentProcessed: true },
    });

    expect(result).toEqual(
      expect.objectContaining({
        allowed: false,
        decision: 'block',
        guardName: 'duplicate_payment',
        reasonTag: 'duplicate_payment',
      }),
    );
  });

  it('blocks payment amount exceeded guard', async () => {
    const prisma = { mindGuardAudit: { create: jest.fn() } };
    const service = new MindGuardsService(prisma as never, engine);

    const result = await service.evaluate({
      workspaceId: 'ws-1',
      decisionType: 'product_offer',
      action: 'process_payment',
      context: { paymentAmount: 5000, maxPaymentAmount: 1000 },
    });

    expect(result).toEqual(
      expect.objectContaining({
        allowed: false,
        guardName: 'payment_amount_exceeded',
        reasonTag: 'payment_amount_exceeded',
      }),
    );
    expect(result.reason).toContain('5000');
    expect(result.reason).toContain('1000');
  });

  it('allows payment when amount is within limit', async () => {
    const prisma = { mindGuardAudit: { create: jest.fn() } };
    const service = new MindGuardsService(prisma as never, engine);

    const result = await service.evaluate({
      workspaceId: 'ws-1',
      decisionType: 'product_offer',
      action: 'process_payment',
      context: { paymentAmount: 500, maxPaymentAmount: 1000 },
    });

    expect(result.allowed).toBe(true);
    expect(result.reasonTag).toBe('all_guards_passed');
  });

  it('blocks campaign action when budget is exhausted', async () => {
    const prisma = { mindGuardAudit: { create: jest.fn() } };
    const service = new MindGuardsService(prisma as never, engine);

    const result = await service.evaluate({
      workspaceId: 'ws-1',
      decisionType: 'broadcast_window',
      action: 'launch_campaign',
      context: { campaignBudgetExhausted: true },
    });

    expect(result).toEqual(
      expect.objectContaining({
        allowed: false,
        guardName: 'campaign_budget_exhausted',
        reasonTag: 'campaign_budget_exhausted',
      }),
    );
  });

  it('blocks campaign action when campaign is not active', async () => {
    const prisma = { mindGuardAudit: { create: jest.fn() } };
    const service = new MindGuardsService(prisma as never, engine);

    const result = await service.evaluate({
      workspaceId: 'ws-1',
      decisionType: 'broadcast_window',
      action: 'launch_campaign',
      context: { campaignActive: false },
    });

    expect(result).toEqual(
      expect.objectContaining({
        allowed: false,
        guardName: 'campaign_inactive',
        reasonTag: 'campaign_inactive',
      }),
    );
  });

  it('allows campaign action when active and budget available', async () => {
    const prisma = { mindGuardAudit: { create: jest.fn() } };
    const service = new MindGuardsService(prisma as never, engine);

    const result = await service.evaluate({
      workspaceId: 'ws-1',
      decisionType: 'broadcast_window',
      action: 'launch_campaign',
      context: { campaignBudgetExhausted: false, campaignActive: true },
    });

    expect(result.allowed).toBe(true);
    expect(result.reasonTag).toBe('all_guards_passed');
  });

  it('persists channel and native audio support in guard context', async () => {
    const prisma = { mindGuardAudit: { create: jest.fn() } };
    const service = new MindGuardsService(prisma as never, engine);

    await service.evaluate({
      workspaceId: 'ws-1',
      decisionType: 'message_format',
      action: 'send_audio_message',
      context: {
        channel: 'instagram',
        supportsAudio: true,
        supportsNativeAudio: true,
      },
    });

    expect(prisma.mindGuardAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          context: expect.objectContaining({
            channel: 'instagram',
            supportsAudio: true,
            supportsNativeAudio: true,
          }),
        }),
      }),
    );
  });

  it('blocks escalation when already in progress', async () => {
    const prisma = { mindGuardAudit: { create: jest.fn() } };
    const service = new MindGuardsService(prisma as never, engine);

    const result = await service.evaluate({
      workspaceId: 'ws-1',
      decisionType: 'human_transfer',
      action: 'request_escalation',
      context: { escalationInProgress: true },
    });

    expect(result).toEqual(
      expect.objectContaining({
        allowed: false,
        guardName: 'escalation_in_progress',
        reasonTag: 'escalation_in_progress',
      }),
    );
  });

  it('blocks escalation when no human is available', async () => {
    const prisma = { mindGuardAudit: { create: jest.fn() } };
    const service = new MindGuardsService(prisma as never, engine);

    const result = await service.evaluate({
      workspaceId: 'ws-1',
      decisionType: 'human_transfer',
      action: 'request_escalation',
      context: { humanAvailable: false },
    });

    expect(result).toEqual(
      expect.objectContaining({
        allowed: false,
        guardName: 'no_human_available',
        reasonTag: 'no_human_available',
      }),
    );
  });

  it('allows escalation when human is available and not in progress', async () => {
    const prisma = { mindGuardAudit: { create: jest.fn() } };
    const service = new MindGuardsService(prisma as never, engine);

    const result = await service.evaluate({
      workspaceId: 'ws-1',
      decisionType: 'human_transfer',
      action: 'request_escalation',
      context: { escalationInProgress: false, humanAvailable: true },
    });

    expect(result.allowed).toBe(true);
    expect(result.reasonTag).toBe('all_guards_passed');
  });

  it('provides code-native web search fallback without LLM dependency', () => {
    const planLimits = {
      ensureTokenBudget: jest.fn().mockResolvedValue(undefined),
      trackAiUsage: jest.fn().mockResolvedValue(undefined),
    };
    const storage = { upload: jest.fn(), uploadFromUrl: jest.fn() };
    const composer = new KloelComposerService(planLimits as never, storage as never);

    const digest = composer.codeNativeSearchWeb('preço do café no Brasil');

    expect(digest.answer).toContain('Pesquisa web indisponível');
    expect(digest.answer).toContain('preço');
    expect(digest.answer).toContain('café');
    expect(digest.sources).toEqual([]);
    expect(digest.totalTokens).toBe(0);
  });

  it('codeNativeSearchWeb returns empty for blank query', () => {
    const planLimits = {
      ensureTokenBudget: jest.fn().mockResolvedValue(undefined),
      trackAiUsage: jest.fn().mockResolvedValue(undefined),
    };
    const storage = { upload: jest.fn(), uploadFromUrl: jest.fn() };
    const composer = new KloelComposerService(planLimits as never, storage as never);

    const digest = composer.codeNativeSearchWeb('   ');

    expect(digest.answer).toBe('');
    expect(digest.sources).toEqual([]);
    expect(digest.totalTokens).toBe(0);
  });
});
