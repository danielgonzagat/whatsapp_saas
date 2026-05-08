import { MindBanditService } from './mind-bandit.service';
import { MindCaseMemoryService } from './mind-case-memory.service';
import { MindConceptService } from './mind-concepts.service';
import { MindGlobalPriorService } from './mind-global-prior.service';
import { MindGuardsService } from './mind-guards.service';
import { MindReportService } from './mind-report.service';
import { MindWorkspaceStateService } from './mind-workspace-state.service';

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

  it('aggregates global prior arms with a workspace-scoped batched query', async () => {
    const prisma = {
      workspace: {
        findMany: jest.fn().mockResolvedValue([{ id: 'ws-1' }, { id: 'ws-2' }]),
      },
      mindBanditArm: {
        findMany: jest.fn().mockResolvedValue([
          {
            workspaceId: 'ws-1',
            arm: 'proof',
            alpha: 3,
            beta: 1,
            pulls: 4,
            wins: 3,
          },
          {
            workspaceId: 'ws-2',
            arm: 'proof',
            alpha: 2,
            beta: 2,
            pulls: 4,
            wins: 2,
          },
        ]),
      },
    };
    const service = new MindGlobalPriorService(prisma as never);

    await expect(service.getPrior('cart_recovery')).resolves.toEqual(
      expect.objectContaining({
        decisionType: 'cart_recovery',
        totalPulls: 8,
        arms: [
          expect.objectContaining({
            arm: 'proof',
            aggregateAlpha: 5,
            aggregateBeta: 3,
            workspaceCount: 2,
          }),
        ],
      }),
    );
    expect(prisma.mindBanditArm.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: { in: ['ws-1', 'ws-2'] },
          decisionType: 'cart_recovery',
          pulls: { gt: 0 },
        },
      }),
    );
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
});
