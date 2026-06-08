import { Test } from '@nestjs/testing';
import { KloelToolDispatcherService } from './kloel-tool-dispatcher.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { KloelCapabilitiesService } from './capabilities/kloel-capabilities.service';
import { PromptRefinerCapability } from './capabilities/prompt-refiner.capability';
import { ResponseDepthAdvisorCapability } from './capabilities/response-depth-advisor.capability';
import { StructuredTextExtractorCapability } from './capabilities/structured-text-extractor.capability';

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

jest.mock('./smart-payment.service', () => ({
  SmartPaymentService: class MockSmartPaymentService {},
}));

import { KloelChatToolsService } from './kloel-chat-tools.service';
import { KloelBusinessConfigToolsService } from './kloel-business-config-tools.service';
import { KloelWhatsAppToolsService } from './kloel-whatsapp-tools.service';
import { KloelComposerService } from './kloel-composer.service';
import { AuditService } from '../audit/audit.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import { KloelCodeToolsService } from './kloel-code-tools.service';
import { KloelCodeAnalysisService } from './kloel-code-analysis.service';
import { CapabilityRegistryV2Service } from './capability-registry-v2/capability-registry-v2.service';
import { SmartPaymentService } from './smart-payment.service';
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
  createCapRegistryV2Mock,
  createSmartPaymentMock,
  DEFAULT_WS_ID,
} from './kloel-tool-dispatcher.service.fixtures';

/**
 * Proof: the three internal ECC cognition capabilities are reachable through
 * the live tool dispatcher (KloelToolDispatcherService.executeTool). The
 * dispatcher routes the `mind.capability.*` names through the fast-path into a
 * REAL KloelCapabilitiesService (built from the actual capability classes, not
 * a mock), and the returned ToolResult carries the capability's real output.
 */
describe('KloelToolDispatcherService — ECC capability dispatch', () => {
  let service: KloelToolDispatcherService;

  beforeEach(async () => {
    const capabilities = new KloelCapabilitiesService(
      new StructuredTextExtractorCapability(),
      new ResponseDepthAdvisorCapability(),
      new PromptRefinerCapability(),
    );

    const module = await Test.createTestingModule({
      providers: [
        KloelToolDispatcherService,
        { provide: PrismaService, useValue: createPrismaMock() },
        { provide: PlanLimitsService, useValue: createPlanLimitsMock() },
        { provide: KloelChatToolsService, useValue: createChatToolsMock() },
        { provide: KloelBusinessConfigToolsService, useValue: createBizConfigToolsMock() },
        { provide: KloelWhatsAppToolsService, useValue: createWhatsappToolsMock() },
        { provide: KloelComposerService, useValue: createComposerMock() },
        { provide: AuditService, useValue: createAuditMock() },
        { provide: KloelCodeToolsService, useValue: createCodeToolsMock() },
        { provide: KloelCodeAnalysisService, useValue: createCodeAnalysisMock() },
        { provide: OpsAlertService, useValue: createOpsAlertMock() },
        { provide: CapabilityRegistryV2Service, useValue: createCapRegistryV2Mock() },
        { provide: SmartPaymentService, useValue: createSmartPaymentMock() },
        { provide: KloelCapabilitiesService, useValue: capabilities },
      ],
    }).compile();

    service = module.get(KloelToolDispatcherService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('PROOF: dispatches mind.capability.refine_prompt and returns a real prompt-refiner result', async () => {
    const result = await service.executeTool(DEFAULT_WS_ID, 'mind.capability.refine_prompt', {
      prompt: 'Corrige o bug no fluxo de autenticação',
    });

    expect(result.success).toBe(true);
    expect(result.capability).toBe('prompt_refiner');
    expect(result.intent).toBe('bug_fix');
    expect(typeof result.refinedPrompt).toBe('string');
    expect(result.refinedPrompt as string).toContain('correção de bug');
    // Internal capability: the underlying provider/source must NOT leak.
    expect(JSON.stringify(result)).not.toContain('skill');
  });

  it('PROOF: dispatches mind.capability.extract_structured_text and returns recovered rows', async () => {
    const result = await service.executeTool(
      DEFAULT_WS_ID,
      'mind.capability.extract_structured_text',
      { text: 'a, b\nc, d', columns: ['x', 'y'] },
    );

    expect(result.success).toBe(true);
    expect(result.capability).toBe('structured_text_extractor');
    expect(Array.isArray(result.rows)).toBe(true);
    expect((result.rows as unknown[]).length).toBe(2);
  });

  it('PROOF: dispatches mind.capability.advise_response_depth and returns depth options', async () => {
    const result = await service.executeTool(
      DEFAULT_WS_ID,
      'mind.capability.advise_response_depth',
      { prompt: 'O que é PIX?' },
    );

    expect(result.success).toBe(true);
    expect(result.capability).toBe('response_depth_advisor');
    expect(Array.isArray(result.options)).toBe(true);
    expect((result.options as unknown[]).length).toBeGreaterThan(0);
  });

  it('validates required args before invoking a capability', async () => {
    const result = await service.executeTool(DEFAULT_WS_ID, 'mind.capability.refine_prompt', {});
    expect(result.success).toBe(false);
    expect(result.error).toBe('missing_prompt');
  });

  it('returns a clean error when the capabilities service is not provided', async () => {
    const module = await Test.createTestingModule({
      providers: [
        KloelToolDispatcherService,
        { provide: PrismaService, useValue: createPrismaMock() },
        { provide: PlanLimitsService, useValue: createPlanLimitsMock() },
        { provide: KloelChatToolsService, useValue: createChatToolsMock() },
        { provide: KloelBusinessConfigToolsService, useValue: createBizConfigToolsMock() },
        { provide: KloelWhatsAppToolsService, useValue: createWhatsappToolsMock() },
        { provide: KloelComposerService, useValue: createComposerMock() },
        { provide: AuditService, useValue: createAuditMock() },
        { provide: KloelCodeToolsService, useValue: createCodeToolsMock() },
        { provide: KloelCodeAnalysisService, useValue: createCodeAnalysisMock() },
        { provide: OpsAlertService, useValue: createOpsAlertMock() },
        { provide: CapabilityRegistryV2Service, useValue: createCapRegistryV2Mock() },
        { provide: SmartPaymentService, useValue: createSmartPaymentMock() },
      ],
    }).compile();
    const bareService = module.get(KloelToolDispatcherService);

    const result = await bareService.executeTool(
      DEFAULT_WS_ID,
      'mind.capability.refine_prompt',
      { prompt: 'cria algo' },
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe('capabilities_service_unavailable');
  });
});
