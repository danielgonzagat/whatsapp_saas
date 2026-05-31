import { Test, TestingModule } from '@nestjs/testing';
import { KloelToolDispatcherService } from './kloel-tool-dispatcher.service';
import { MindGuardsService } from './mind/policy/mind-guards.service';
import { CapabilityRegistryV2Service } from './capability-registry-v2/capability-registry-v2.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { KloelChatToolsService } from './kloel-chat-tools.service';
import { KloelBusinessConfigToolsService } from './kloel-business-config-tools.service';
import { KloelWhatsAppToolsService } from './kloel-whatsapp-tools.service';
import { KloelComposerService } from './kloel-composer.service';
import { AuditService } from '../audit/audit.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import { KloelCodeToolsService } from './kloel-code-tools.service';
import { KloelCodeAnalysisService } from './kloel-code-analysis.service';
import { SmartPaymentService } from './smart-payment.service';

const WS_ID = 'ws-mind-guard-test';
const TOOL_NAME = 'change_plan'; // MUTATION_SENSITIVE in tier-0c-mutations

function buildModule(mindGuardsOverride: Partial<MindGuardsService> | null) {
  const prisma = {
    workspace: {
      findUnique: jest.fn().mockResolvedValue({
        id: WS_ID,
        providerSettings: {},
      }),
    },
    approvalRequest: {
      create: jest.fn().mockResolvedValue({ id: 'approval-1' }),
    },
  };

  const planLimits = {
    ensureTokenBudget: jest.fn().mockResolvedValue(undefined),
    trackAiUsage: jest.fn().mockResolvedValue(undefined),
  };

  const chatTools = {};
  const bizConfig = {};
  const whatsapp = {};
  const composer = {};
  const audit = {};
  const opsAlert = { alertOnCriticalError: jest.fn() };
  const codeTools = {};
  const codeAnalysis = {};
  const smartPayment = {};

  const providers = [
    KloelToolDispatcherService,
    CapabilityRegistryV2Service,
    { provide: PrismaService, useValue: prisma },
    { provide: PlanLimitsService, useValue: planLimits },
    { provide: KloelChatToolsService, useValue: chatTools },
    { provide: KloelBusinessConfigToolsService, useValue: bizConfig },
    { provide: KloelWhatsAppToolsService, useValue: whatsapp },
    { provide: KloelComposerService, useValue: composer },
    { provide: AuditService, useValue: audit },
    { provide: OpsAlertService, useValue: opsAlert },
    { provide: KloelCodeToolsService, useValue: codeTools },
    { provide: KloelCodeAnalysisService, useValue: codeAnalysis },
    { provide: SmartPaymentService, useValue: smartPayment },
  ];

  if (mindGuardsOverride !== null) {
    providers.push({
      provide: MindGuardsService,
      useValue: mindGuardsOverride,
    });
  }

  return { prisma, providers };
}

async function buildService(mindGuardsOverride: Partial<MindGuardsService> | null) {
  const { providers } = buildModule(mindGuardsOverride);
  const module: TestingModule = await Test.createTestingModule({
    providers,
  }).compile();
  return module.get<KloelToolDispatcherService>(KloelToolDispatcherService);
}

describe('KloelToolDispatcherService — MindGuards gating', () => {
  // ── guard absent → tool dispatches normally ──────────────────────
  it('deve permitir execução quando MindGuardsService não está injetado', async () => {
    const service = await buildService(null);

    // change_plan goes through requestHighRiskApproval → creates approval
    const result = await service.executeTool(WS_ID, TOOL_NAME, { plan: 'pro' });

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  // ── guard verdict 'allow' → tool dispatches normally ──────────────
  it('deve permitir execução quando guard retorna allow', async () => {
    const mockGuards = {
      evaluate: jest.fn().mockResolvedValue({
        allowed: true,
        action: TOOL_NAME,
        decision: 'allow' as const,
        guardName: 'all_guards',
        reason: 'Ação aprovada.',
        reasonTag: 'all_guards_passed' as const,
        context: {},
      }),
    };

    const service = await buildService(mockGuards);
    const result = await service.executeTool(WS_ID, TOOL_NAME, { plan: 'pro' });

    expect(result.success).toBe(true);
    expect(mockGuards.evaluate).toHaveBeenCalledWith({
      action: TOOL_NAME,
      context: {},
      decisionType: 'tool_execution',
      workspaceId: WS_ID,
    });
  });

  // ── guard verdict 'block' → dispatcher returns error ─────────────
  it('deve bloquear execução quando guard retorna block', async () => {
    const mockGuards = {
      evaluate: jest.fn().mockResolvedValue({
        allowed: false,
        action: TOOL_NAME,
        decision: 'block' as const,
        guardName: 'compliance_window',
        reason: 'Fora da janela de conformidade.',
        reasonTag: 'compliance_window' as const,
        context: {},
      }),
    };

    const service = await buildService(mockGuards);
    const result = await service.executeTool(WS_ID, TOOL_NAME, { plan: 'pro' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('mind_guard_blocked');
    expect(result.reasons).toEqual(['Fora da janela de conformidade.']);
    expect(mockGuards.evaluate).toHaveBeenCalledWith({
      action: TOOL_NAME,
      context: {},
      decisionType: 'tool_execution',
      workspaceId: WS_ID,
    });
  });

  // ── guard verdict 'warn' → tool dispatches with warn logged ──────
  it('deve permitir execução com aviso quando guard retorna warn', async () => {
    const mockGuards = {
      evaluate: jest.fn().mockResolvedValue({
        allowed: true,
        action: TOOL_NAME,
        decision: 'warn' as const,
        guardName: 'daily_contact_limit',
        reason: 'Limite diário próximo.',
        reasonTag: 'daily_contact_limit' as const,
        context: {},
      }),
    };

    const service = await buildService(mockGuards);
    const result = await service.executeTool(WS_ID, TOOL_NAME, { plan: 'pro' });

    // warn should not block execution
    expect(result.success).toBe(true);
    expect(mockGuards.evaluate).toHaveBeenCalled();
  });

  // ── non-sensitive tool → guard NOT consulted ────────────────────
  it('não deve consultar guard para ferramentas não sensíveis', async () => {
    const mockGuards = {
      evaluate: jest.fn(),
    };

    const service = await buildService(mockGuards);
    // 'toggle_autopilot' is MUTATION_SAFE — not MUTATION_SENSITIVE
    await service.executeTool(WS_ID, 'toggle_autopilot', { enabled: true });

    expect(mockGuards.evaluate).not.toHaveBeenCalled();
  });

  // ── unknown tool → guard NOT consulted ──────────────────────────
  it('não deve consultar guard para ferramentas desconhecidas', async () => {
    const mockGuards = {
      evaluate: jest.fn(),
    };

    const service = await buildService(mockGuards);
    await service.executeTool(WS_ID, 'nonexistent_tool', {});

    expect(mockGuards.evaluate).not.toHaveBeenCalled();
  });

  // ── workspaceId repassado ao guard ───────────────────────────────
  it('deve repassar workspaceId ao guard', async () => {
    const mockGuards = {
      evaluate: jest.fn().mockResolvedValue({
        allowed: true,
        action: TOOL_NAME,
        decision: 'allow' as const,
        guardName: 'all_guards',
        reason: 'Ok.',
        reasonTag: 'all_guards_passed' as const,
        context: {},
      }),
    };

    const service = await buildService(mockGuards);
    await service.executeTool(WS_ID, TOOL_NAME, { plan: 'pro' });

    const evalCalls = mockGuards.evaluate.mock.calls as Array<[{ workspaceId: string }]>;
    const callArg = evalCalls[0]?.[0];
    expect(callArg?.workspaceId).toBe(WS_ID);
  });
});
