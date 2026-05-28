import { Test } from '@nestjs/testing';
import { KloelToolDispatcherService } from './kloel-tool-dispatcher.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { MindCapabilityExecutor } from './mind/coordination/mind-capability-executor.service';

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
import { AccountService } from './account.service';
import { SelfHealthService } from './self-awareness/self-health.service';
import { SelfGapsService } from './self-awareness/self-gaps.service';
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
  createAccountMock,
  createSelfHealthMock,
  createSelfGapsMock,
  createCapRegistryV2Mock,
  createSmartPaymentMock,
  DEFAULT_WS_ID,
  type DispatcherPrismaMock,
  type DispatcherChatToolsMock,
  type DispatcherBizConfigMock,
  type DispatcherWhatsappMock,
  type DispatcherComposerMock,
  type DispatcherAuditMock,
  type DispatcherOpsAlertMock,
  type DispatcherPlanLimitsMock,
  type DispatcherCodeToolsMock,
  type DispatcherCodeAnalysisMock,
  type DispatcherAccountMock,
  type DispatcherSelfHealthMock,
  type DispatcherSelfGapsMock,
  type DispatcherCapRegistryV2Mock,
} from './kloel-tool-dispatcher.service.fixtures';

describe('KloelToolDispatcherService — capability executor observer', () => {
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
  let accountService: DispatcherAccountMock;
  let selfHealthService: DispatcherSelfHealthMock;
  let selfGapsService: DispatcherSelfGapsMock;
  let capRegistryV2Service: DispatcherCapRegistryV2Mock;

  function createModule(executorOverride?: { recordExecution: jest.Mock }) {
    const providers: Array<unknown> = [
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
      { provide: AccountService, useValue: accountService },
      { provide: SelfHealthService, useValue: selfHealthService },
      { provide: SelfGapsService, useValue: selfGapsService },
      { provide: CapabilityRegistryV2Service, useValue: capRegistryV2Service },
      { provide: SmartPaymentService, useValue: createSmartPaymentMock() },
    ];

    if (executorOverride !== undefined) {
      providers.push({
        provide: MindCapabilityExecutor,
        useValue: executorOverride,
      });
    }

    return Test.createTestingModule({ providers }).compile();
  }

  beforeEach(() => {
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
    accountService = createAccountMock();
    selfHealthService = createSelfHealthMock();
    selfGapsService = createSelfGapsMock();
    capRegistryV2Service = createCapRegistryV2Mock();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('executor present + tool success', () => {
    it('calls recordExecution with success=true when tool succeeds', async () => {
      const recordExecution = jest.fn();
      const module = await createModule({ recordExecution });
      service = module.get(KloelToolDispatcherService);

      const result = await service.executeTool(DEFAULT_WS_ID, 'list_products', {});

      expect(result.success).toBe(true);
      expect(recordExecution).toHaveBeenCalledTimes(1);
      expect(recordExecution).toHaveBeenCalledWith(
        DEFAULT_WS_ID,
        'list_products',
        {},
        expect.objectContaining({ success: true }),
        true,
      );
    });
  });

  describe('executor present + tool error', () => {
    it('calls recordExecution with success=false when tool errors', async () => {
      const recordExecution = jest.fn();
      const module = await createModule({ recordExecution });
      service = module.get(KloelToolDispatcherService);

      chatToolsService.toolSaveProduct = jest.fn().mockRejectedValue(new Error('Save failed'));

      const result = await service.executeTool(DEFAULT_WS_ID, 'save_product', {
        name: 'X',
        price: 1,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Save failed');
      expect(recordExecution).toHaveBeenCalledTimes(1);
      expect(recordExecution).toHaveBeenCalledWith(
        DEFAULT_WS_ID,
        'save_product',
        { name: 'X', price: 1 },
        expect.objectContaining({ success: false, error: 'Save failed' }),
        false,
      );
    });
  });

  describe('executor absent', () => {
    it('does not throw when MindCapabilityExecutor is not provided', async () => {
      const module = await createModule();
      service = module.get(KloelToolDispatcherService);

      const result = await service.executeTool(DEFAULT_WS_ID, 'list_products', {});

      expect(result.success).toBe(true);
    });
  });

  describe('executor throws', () => {
    it('logs warn and preserves dispatcher result when recordExecution throws', async () => {
      const recordExecution = jest.fn().mockImplementation(() => {
        throw new Error('executor crash');
      });
      const module = await createModule({ recordExecution });
      service = module.get(KloelToolDispatcherService);

      const warnSpy = jest.spyOn(
        (service as unknown as { logger: { warn: jest.Mock } }).logger,
        'warn',
      );

      const result = await service.executeTool(DEFAULT_WS_ID, 'list_products', {});

      expect(result.success).toBe(true);
      expect(recordExecution).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith('kloel_capability_executor_skipped', expect.any(Error));
    });
  });
});
