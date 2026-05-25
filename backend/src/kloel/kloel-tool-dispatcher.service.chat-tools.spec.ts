import { Test, TestingModule } from '@nestjs/testing';
import { KloelToolDispatcherService } from './kloel-tool-dispatcher.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlanLimitsService } from '../billing/plan-limits.service';

jest.mock('./kloel-chat-tools.service', () => ({
  KloelChatToolsService: class MockKloelChatToolsService {},
}));

jest.mock('./kloel-business-config-tools.service', () => ({
  KloelBusinessConfigToolsService: class MockKloelBusinessConfigToolsService {},
}));

jest.mock('./kloel-whatsapp-tools.service', () => ({
  KloelWhatsAppToolsService: class MockKloelWhatsAppToolsService {},
}));

jest.mock('./kloel-composer.service', () => ({
  KloelComposerService: class MockKloelComposerService {},
}));

jest.mock('../audit/audit.service', () => ({
  AuditService: class MockAuditService {},
}));

jest.mock('../observability/ops-alert.service', () => ({
  OpsAlertService: class MockOpsAlertService {},
}));

jest.mock('./kloel-code-tools.service', () => ({
  KloelCodeToolsService: class MockKloelCodeToolsService {},
}));

import { KloelChatToolsService } from './kloel-chat-tools.service';
import { KloelBusinessConfigToolsService } from './kloel-business-config-tools.service';
import { KloelWhatsAppToolsService } from './kloel-whatsapp-tools.service';
import { KloelComposerService } from './kloel-composer.service';
import { AuditService } from '../audit/audit.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import { KloelCodeToolsService } from './kloel-code-tools.service';
import { KloelCodeAnalysisService } from './kloel-code-analysis.service';
import {
  createPrismaMock,
  createPlanLimitsMock,
  createChatToolsMock,
  createBizConfigToolsMock,
  createWhatsappToolsMock,
  createComposerMock,
  createAuditMock,
  createOpsAlertMock,
  createCodeToolsMock,
  createCodeAnalysisMock,
  DEFAULT_WS_ID,
} from './kloel-tool-dispatcher.service.fixtures';
import type {
  DispatcherPrismaMock,
  DispatcherChatToolsMock,
  DispatcherBizConfigMock,
  DispatcherWhatsappMock,
  DispatcherComposerMock,
  DispatcherAuditMock,
  DispatcherOpsAlertMock,
  DispatcherPlanLimitsMock,
  DispatcherCodeToolsMock,
  DispatcherCodeAnalysisMock,
} from './kloel-tool-dispatcher.service.fixtures';

describe('KloelToolDispatcherService — chat tools routing', () => {
  let service: KloelToolDispatcherService;
  let prisma: DispatcherPrismaMock;
  let planLimits: DispatcherPlanLimitsMock;
  let chatToolsService: DispatcherChatToolsMock;
  let bizConfigToolsService: DispatcherBizConfigMock;
  let whatsappToolsService: DispatcherWhatsappMock;
  let composerService: DispatcherComposerMock;
  let auditService: DispatcherAuditMock;
  let opsAlert: DispatcherOpsAlertMock;
  let codeToolsService: DispatcherCodeToolsMock;
  let codeAnalysisService: DispatcherCodeAnalysisMock;

  beforeEach(async () => {
    prisma = createPrismaMock();
    planLimits = createPlanLimitsMock();
    chatToolsService = createChatToolsMock();
    bizConfigToolsService = createBizConfigToolsMock();
    whatsappToolsService = createWhatsappToolsMock();
    composerService = createComposerMock();
    auditService = createAuditMock();
    opsAlert = createOpsAlertMock();
    codeToolsService = createCodeToolsMock();
    codeAnalysisService = createCodeAnalysisMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KloelToolDispatcherService,
        { provide: PrismaService, useValue: prisma },
        { provide: PlanLimitsService, useValue: planLimits },
        { provide: KloelChatToolsService, useValue: chatToolsService },
        { provide: KloelBusinessConfigToolsService, useValue: bizConfigToolsService },
        { provide: KloelWhatsAppToolsService, useValue: whatsappToolsService },
        { provide: KloelComposerService, useValue: composerService },
        { provide: AuditService, useValue: auditService },
        { provide: KloelCodeToolsService, useValue: codeToolsService },
        { provide: KloelCodeAnalysisService, useValue: codeAnalysisService },
        { provide: OpsAlertService, useValue: opsAlert },
      ],
    }).compile();

    service = module.get<KloelToolDispatcherService>(KloelToolDispatcherService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('routes save_product to chatToolsService', async () => {
    await service.executeTool(DEFAULT_WS_ID, 'save_product', { name: 'P', price: 10 });
    expect(chatToolsService.toolSaveProduct).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      name: 'P',
      price: 10,
    });
  });

  it('routes list_products to chatToolsService', async () => {
    await service.executeTool(DEFAULT_WS_ID, 'list_products', {});
    expect(chatToolsService.toolListProducts).toHaveBeenCalledWith(DEFAULT_WS_ID);
  });

  it('routes delete_product to chatToolsService', async () => {
    await service.executeTool(DEFAULT_WS_ID, 'delete_product', { productId: 'p-1' });
    expect(chatToolsService.toolDeleteProduct).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      productId: 'p-1',
    });
  });

  it('routes toggle_autopilot to chatToolsService', async () => {
    await service.executeTool(DEFAULT_WS_ID, 'toggle_autopilot', { enabled: true });
    expect(chatToolsService.toolToggleAutopilot).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      enabled: true,
    });
  });

  it('routes set_brand_voice to chatToolsService', async () => {
    await service.executeTool(DEFAULT_WS_ID, 'set_brand_voice', { tone: 'formal' });
    expect(chatToolsService.toolSetBrandVoice).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      tone: 'formal',
    });
  });

  it('routes get_dashboard_summary to chatToolsService', async () => {
    await service.executeTool(DEFAULT_WS_ID, 'get_dashboard_summary', { period: 'today' });
    expect(chatToolsService.toolGetDashboardSummary).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      period: 'today',
    });
  });

  it('routes create_flow to chatToolsService', async () => {
    await service.executeTool(DEFAULT_WS_ID, 'create_flow', { name: 'Flow' });
    expect(chatToolsService.toolCreateFlow).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      name: 'Flow',
    });
  });

  it('routes list_flows to chatToolsService', async () => {
    await service.executeTool(DEFAULT_WS_ID, 'list_flows', {});
    expect(chatToolsService.toolListFlows).toHaveBeenCalledWith(DEFAULT_WS_ID);
  });

  it('routes create_agent_job to chatToolsService', async () => {
    await service.executeTool(DEFAULT_WS_ID, 'create_agent_job', {
      title: 'Daily audit',
      prompt: 'Review memory',
    });
    expect(chatToolsService.toolCreateAgentJob).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      title: 'Daily audit',
      prompt: 'Review memory',
    });
  });

  it('routes list_agent_jobs to chatToolsService', async () => {
    await service.executeTool(DEFAULT_WS_ID, 'list_agent_jobs', {});
    expect(chatToolsService.toolListAgentJobs).toHaveBeenCalledWith(DEFAULT_WS_ID);
  });

  it('routes set_agent_job_enabled to chatToolsService', async () => {
    await service.executeTool(DEFAULT_WS_ID, 'set_agent_job_enabled', {
      jobId: 'daily',
      enabled: false,
    });
    expect(chatToolsService.toolSetAgentJobEnabled).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      jobId: 'daily',
      enabled: false,
    });
  });

  it('routes search_agent_memory to chatToolsService memory/contact search', async () => {
    await service.executeTool(DEFAULT_WS_ID, 'search_agent_memory', { query: 'checkout' });
    expect(chatToolsService.toolSearchAgentMemoryWithContacts).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      query: 'checkout',
    });
  });

  it('routes search_agent_sessions to chatToolsService', async () => {
    await service.executeTool(DEFAULT_WS_ID, 'search_agent_sessions', { query: 'checkout' });
    expect(chatToolsService.toolSearchAgentSessions).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      query: 'checkout',
    });
  });

  it('routes get_agent_artifact to chatToolsService', async () => {
    await service.executeTool(DEFAULT_WS_ID, 'get_agent_artifact', {
      artifactId: 'tool_artifact:search_agent_memory:123:abcd',
    });
    expect(chatToolsService.toolGetAgentArtifact).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      artifactId: 'tool_artifact:search_agent_memory:123:abcd',
    });
  });

  it('routes upsert_agent_skill to chatToolsService', async () => {
    await service.executeTool(DEFAULT_WS_ID, 'upsert_agent_skill', {
      id: 'checkout',
      title: 'Checkout',
      summary: 'Recover checkout',
    });
    expect(chatToolsService.toolUpsertAgentSkill).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      id: 'checkout',
      title: 'Checkout',
      summary: 'Recover checkout',
    });
  });

  it('routes record_agent_skill_outcome to chatToolsService', async () => {
    await service.executeTool(DEFAULT_WS_ID, 'record_agent_skill_outcome', {
      skillId: 'checkout',
      outcome: 'succeeded',
    });
    expect(chatToolsService.toolRecordAgentSkillOutcome).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      skillId: 'checkout',
      outcome: 'succeeded',
    });
  });

  it('routes record_agent_delegation to chatToolsService', async () => {
    await service.executeTool(DEFAULT_WS_ID, 'record_agent_delegation', {
      task: 'Inspect Hermes delegation',
      result: 'Found governed child sessions',
    });
    expect(chatToolsService.toolRecordAgentDelegation).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      task: 'Inspect Hermes delegation',
      result: 'Found governed child sessions',
    });
  });

  it('routes agent evidence tools to chatToolsService', async () => {
    await service.executeTool(DEFAULT_WS_ID, 'record_agent_evidence', {
      source: 'jest',
      content: 'validated',
    });
    await service.executeTool(DEFAULT_WS_ID, 'search_agent_evidence', { query: 'validated' });
    await service.executeTool(DEFAULT_WS_ID, 'list_agent_evidence', { type: 'validation' });
    await service.executeTool(DEFAULT_WS_ID, 'verify_agent_evidence', {});

    expect(chatToolsService.toolRecordAgentEvidence).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      source: 'jest',
      content: 'validated',
    });
    expect(chatToolsService.toolSearchAgentEvidence).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      query: 'validated',
    });
    expect(chatToolsService.toolListAgentEvidence).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      type: 'validation',
    });
    expect(chatToolsService.toolVerifyAgentEvidence).toHaveBeenCalledWith(DEFAULT_WS_ID);
  });
});
