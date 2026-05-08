import { MindBanditService } from './mind-bandit.service';
import { MindCaseMemoryService } from './mind-case-memory.service';
import { MindConceptService } from './mind-concepts.service';
import { MindGuardsService } from './mind-guards.service';
import { MindReportService } from './mind-report.service';
import { MindWorkspaceStateService } from './mind-workspace-state.service';
import { KloelComposerService } from './kloel-composer.service';

describe('code-native MIND services', () => {
  it('detects commercial concepts and emits concept events', async () => {
    const prisma = {
      mindConceptDetection: {
        create: jest.fn(async ({ data }) => data),
      },
    };
    const events = { recordCommercial: jest.fn() };
    const service = new MindConceptService(prisma as never, events as never);

    const rows = await service.detect({
      workspaceId: 'ws-1',
      subject: 'contact:1',
      text: 'Achei caro, mas quero comprar por pix. Manda o link.',
      occurredAt: new Date('2026-05-07T12:00:00Z'),
      features: { channel: 'instagram' },
    });

    expect(rows.map((row) => row.concept)).toEqual(
      expect.arrayContaining(['price_objection', 'hot_lead', 'imminent_purchase']),
    );
    expect(events.recordCommercial).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        subject: 'contact:1',
        eventType: 'concept.detected',
      }),
    );
  });

  it('returns no concepts and emits nothing for empty text', async () => {
    const prisma = {
      mindConceptDetection: {
        create: jest.fn(async ({ data }) => data),
      },
    };
    const events = { recordCommercial: jest.fn() };
    const service = new MindConceptService(prisma as never, events as never);

    await expect(
      service.detect({
        workspaceId: 'ws-1',
        subject: 'contact:1',
        text: '',
      }),
    ).resolves.toEqual([]);
    expect(prisma.mindConceptDetection.create).not.toHaveBeenCalled();
    expect(events.recordCommercial).not.toHaveBeenCalled();
  });

  it('keeps case-memory similarity scoped to the workspace', async () => {
    const prisma = {
      mindCase: {
        create: jest.fn(async ({ data }) => data),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'case-1',
            workspaceId: 'ws-1',
            tokens: ['comprar', 'pix', 'garantia'],
            features: { channel: 'whatsapp' },
            outcome: 1,
          },
          {
            id: 'case-2',
            workspaceId: 'ws-1',
            tokens: ['cancelar', 'remover'],
            features: { channel: 'email' },
            outcome: 0,
          },
        ]),
      },
    };
    const service = new MindCaseMemoryService(prisma as never);

    await service.recordCase({
      workspaceId: 'ws-1',
      subject: 'contact:1',
      caseType: 'objection',
      text: 'Comprar por pix com garantia',
      action: 'reply',
      occurredAt: new Date('2026-05-07T12:00:00Z'),
      features: { channel: 'whatsapp' },
      outcome: 1,
    });
    const similar = await service.similar({
      workspaceId: 'ws-1',
      caseType: 'objection',
      text: 'quero comprar no pix',
      features: { channel: 'whatsapp' },
    });

    expect(prisma.mindCase.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: 'ws-1', caseType: 'objection' } }),
    );
    expect(similar[0].id).toBe('case-1');
  });

  it('returns empty case-memory matches for a workspace with no rows', async () => {
    const prisma = {
      mindCase: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new MindCaseMemoryService(prisma as never);

    await expect(
      service.similar({
        workspaceId: 'ws-2',
        caseType: 'objection',
        text: 'quero comprar no pix',
      }),
    ).resolves.toEqual([]);
    expect(prisma.mindCase.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: 'ws-2', caseType: 'objection' } }),
    );
  });

  it('blocks forbidden actions through deterministic guards', async () => {
    const prisma = { mindGuardAudit: { create: jest.fn() } };
    const service = new MindGuardsService(prisma as never);

    await expect(
      service.evaluate({
        workspaceId: 'ws-1',
        decisionType: 'coupon_offer',
        action: 'coupon_50',
        context: { discountPercent: 50, maxDiscountPercent: 20 },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        allowed: false,
        decision: 'block',
        guardName: 'max_discount',
        reasonTag: 'max_discount',
      }),
    );
    expect(prisma.mindGuardAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: 'ws-1',
          guardName: 'max_discount',
          allowed: false,
        }),
      }),
    );
  });

  it('allows safe guard decisions and audits the allow path with reasonTag', async () => {
    const prisma = { mindGuardAudit: { create: jest.fn() } };
    const service = new MindGuardsService(prisma as never);

    await expect(
      service.evaluate({
        workspaceId: 'ws-1',
        decisionType: 'coupon_offer',
        action: 'coupon_10',
        context: { discountPercent: 10, maxDiscountPercent: 20 },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        allowed: true,
        decision: 'allow',
        reasonTag: 'all_guards_passed',
      }),
    );
    expect(prisma.mindGuardAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: 'ws-1',
          guardName: 'all_guards',
          allowed: true,
        }),
      }),
    );
  });

  it('chooses and updates bandit arms without LLM dependency', async () => {
    const prisma = {
      mindBanditArm: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            { id: 'a', arm: 'proof', alpha: 3, beta: 1, pulls: 4, wins: 3, isActive: true },
            { id: 'b', arm: 'discount', alpha: 1, beta: 3, pulls: 4, wins: 1, isActive: true },
          ])
          .mockResolvedValueOnce([]),
        update: jest.fn(),
        updateMany: jest.fn(),
        upsert: jest.fn(),
      },
    };
    const service = new MindBanditService(prisma as never);

    await expect(service.choose('ws-1', 'cart_recovery')).resolves.toEqual({
      workspaceId: 'ws-1',
      decisionType: 'cart_recovery',
      arm: 'proof',
    });
    await service.recordOutcome({
      workspaceId: 'ws-1',
      decisionType: 'cart_recovery',
      arm: 'proof',
      outcome: 1,
    });

    expect(prisma.mindBanditArm.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'a', workspaceId: 'ws-1', decisionType: 'cart_recovery' },
        data: { pulls: { increment: 1 } },
      }),
    );
    expect(prisma.mindBanditArm.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId_decisionType_arm: {
            workspaceId: 'ws-1',
            decisionType: 'cart_recovery',
            arm: 'proof',
          },
        },
        data: expect.objectContaining({ alpha: { increment: 1 }, wins: { increment: 1 } }),
      }),
    );
  });

  it('returns null when no active bandit arms are available', async () => {
    const prisma = {
      mindBanditArm: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    const service = new MindBanditService(prisma as never);

    await expect(service.choose('ws-1', 'cart_recovery')).resolves.toBeNull();
    expect(prisma.mindBanditArm.updateMany).not.toHaveBeenCalled();
  });

  it('persists durable workspace tick state', async () => {
    const prisma = {
      mindWorkspaceState: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ lastWatermark: new Date('2026-05-07T11:00:00Z') }),
        upsert: jest.fn(),
      },
    };
    const service = new MindWorkspaceStateService(prisma as never);

    await expect(service.watermark('ws-1', new Date('2026-05-06T00:00:00Z'))).resolves.toEqual(
      new Date('2026-05-07T11:00:00Z'),
    );
    await service.recordSuccess({
      lastWatermark: new Date('2026-05-07T12:00:00Z'),
      tick: {
        workspaceId: 'ws-1',
        perceived: 2,
        predicted: 1,
        resolved: 1,
        surpriseTotal: 0.5,
        beliefsUpdated: 1,
        decisionsMade: 0,
        durationMs: 12,
      },
    });

    expect(prisma.mindWorkspaceState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'ws-1' },
        update: expect.objectContaining({ tickCount: { increment: 1 }, lastTickMs: 12 }),
      }),
    );
  });

  it('generates a backend-first markdown health report', async () => {
    const prisma = {
      mindWorkspaceState: {
        findUnique: jest.fn().mockResolvedValue({
          lastTickAt: new Date('2026-05-07T12:00:00Z'),
          tickCount: 3,
          perceivedWindow: 9,
          surpriseWindow: 0.7,
        }),
      },
      mindConceptDetection: { findMany: jest.fn().mockResolvedValue([]) },
      mindDailyReport: { upsert: jest.fn(async ({ create }) => create) },
    };
    const beliefs = { list: jest.fn().mockResolvedValue([]) };
    const policy = {
      harness: jest.fn().mockResolvedValue({
        lift: 0,
        mindMean: 0,
        baselineMean: 0,
        n: 0,
        pZScore: 0,
      }),
    };
    const service = new MindReportService(prisma as never, beliefs as never, policy as never);

    const report = await service.generateDaily('ws-1', new Date('2026-05-07T00:00:00Z'));

    expect(report.content).toContain('# Relatorio diario MIND');
    expect(report.content).toContain('## Lift por decisao');
    expect(policy.harness).toHaveBeenCalledWith('ws-1', 'followup_timing', 14);
  });

  it('surfaces daily report persistence failures after collecting lift evidence', async () => {
    const prisma = {
      mindWorkspaceState: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      mindConceptDetection: { findMany: jest.fn().mockResolvedValue([]) },
      mindDailyReport: { upsert: jest.fn().mockRejectedValue(new Error('report write failed')) },
    };
    const beliefs = { list: jest.fn().mockResolvedValue([]) };
    const policy = {
      harness: jest.fn().mockResolvedValue({
        lift: 0,
        mindMean: 0,
        baselineMean: 0,
        n: 0,
        pZScore: 0,
      }),
    };
    const service = new MindReportService(prisma as never, beliefs as never, policy as never);

    await expect(service.generateDaily('ws-1', new Date('2026-05-07T00:00:00Z'))).rejects.toThrow(
      'report write failed',
    );
    expect(policy.harness).toHaveBeenCalledWith('ws-1', 'followup_timing', 14);
  });

  it('blocks duplicate payment guard when paymentProcessed is true', async () => {
    const prisma = { mindGuardAudit: { create: jest.fn() } };
    const service = new MindGuardsService(prisma as never);

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
    const service = new MindGuardsService(prisma as never);

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
    const service = new MindGuardsService(prisma as never);

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
    const service = new MindGuardsService(prisma as never);

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
    const service = new MindGuardsService(prisma as never);

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
    const service = new MindGuardsService(prisma as never);

    const result = await service.evaluate({
      workspaceId: 'ws-1',
      decisionType: 'broadcast_window',
      action: 'launch_campaign',
      context: { campaignBudgetExhausted: false, campaignActive: true },
    });

    expect(result.allowed).toBe(true);
    expect(result.reasonTag).toBe('all_guards_passed');
  });

  it('blocks escalation when already in progress', async () => {
    const prisma = { mindGuardAudit: { create: jest.fn() } };
    const service = new MindGuardsService(prisma as never);

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
    const service = new MindGuardsService(prisma as never);

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
    const service = new MindGuardsService(prisma as never);

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
