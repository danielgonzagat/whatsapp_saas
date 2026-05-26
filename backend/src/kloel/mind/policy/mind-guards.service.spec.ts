import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { KloelRuleEngineService } from '../../rules/kloel-rule-engine.service';
import { MindGuardsService } from './mind-guards.service';
import type { MindActionContext } from '../../mind-code-native.types';

describe('MindGuardsService', () => {
  let service: MindGuardsService;
  let prisma: { mindGuardAudit: { create: jest.Mock } };
  let engine: { evaluate: jest.Mock };

  beforeEach(async () => {
    prisma = { mindGuardAudit: { create: jest.fn().mockResolvedValue({}) } };
    engine = { evaluate: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MindGuardsService,
        { provide: PrismaService, useValue: prisma },
        { provide: KloelRuleEngineService, useValue: engine },
      ],
    }).compile();
    service = module.get(MindGuardsService);
  });

  const baseInput = {
    workspaceId: 'ws-1',
    decisionType: 'send_message',
    action: 'send_template',
    context: {} as MindActionContext,
  };

  it('allows action when engine reports no blocks', async () => {
    engine.evaluate.mockReturnValue({ blocked: false });
    const result = await service.evaluate(baseInput);
    expect(result.allowed).toBe(true);
    expect(result.decision).toBe('allow');
    expect(result.guardName).toBe('all_guards');
    expect(result.reasonTag).toBe('all_guards_passed');
  });

  it('blocks action when engine reports blocked + custom reason', async () => {
    engine.evaluate.mockReturnValue({
      blocked: true,
      blockedBy: 'contact_opt_out',
      blockedReason: 'opt-out flag set',
    });
    const result = await service.evaluate(baseInput);
    expect(result.allowed).toBe(false);
    expect(result.decision).toBe('block');
    expect(result.guardName).toBe('contact_opt_out');
    expect(result.reason).toBe('opt-out flag set');
  });

  it('audits every evaluation in MindGuardAudit table, scoped to workspaceId', async () => {
    engine.evaluate.mockReturnValue({ blocked: false });
    await service.evaluate({ ...baseInput, workspaceId: 'ws-tenant-A' });
    expect(prisma.mindGuardAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: 'ws-tenant-A',
        action: 'send_template',
        decision: 'allow',
        allowed: true,
      }),
    });
  });

  it('falls back to all_guards_passed reasonTag when engine returns an unknown blockedBy', async () => {
    engine.evaluate.mockReturnValue({
      blocked: true,
      blockedBy: 'some_unknown_rule',
      blockedReason: 'r',
    });
    const result = await service.evaluate(baseInput);
    expect(result.reasonTag).toBe('all_guards_passed');
  });

  it('passes ruleContext built only from defined keys (no undefined leaks)', async () => {
    engine.evaluate.mockReturnValue({ blocked: false });
    await service.evaluate({
      ...baseInput,
      context: { channel: 'whatsapp', contactOptOut: false },
    });
    const ctx = engine.evaluate.mock.calls[0][0];
    expect(ctx.action).toBe('send_template');
    expect(ctx.channel).toBe('whatsapp');
    expect(ctx.contactOptOut).toBe(false);
    expect('templateApproved' in ctx).toBe(false);
  });
});
