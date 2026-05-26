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

jest.mock('./kloel-product-sub-resource-tools.service', () => ({
  KloelProductSubResourceToolsService: class MockProductSubToolsService {},
}));

import { KloelChatToolsService } from './kloel-chat-tools.service';
import { KloelBusinessConfigToolsService } from './kloel-business-config-tools.service';
import { KloelWhatsAppToolsService } from './kloel-whatsapp-tools.service';
import { KloelComposerService } from './kloel-composer.service';
import { AuditService } from '../audit/audit.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import { KloelCodeToolsService } from './kloel-code-tools.service';
import { KloelCodeAnalysisService } from './kloel-code-analysis.service';
import { KloelProductSubResourceToolsService } from './kloel-product-sub-resource-tools.service';
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
} from './kloel-tool-dispatcher.service.fixtures';type ProductSubToolsMock = { executeTool: jest.Mock };describe('KloelToolDispatcherService — dotted aliases', () => {
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
  let productSubTools: ProductSubToolsMock;

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
    productSubTools = { executeTool: jest.fn().mockResolvedValue({ success: true }) };

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
        { provide: KloelProductSubResourceToolsService, useValue: productSubTools },
      ],
    }).compile();

    service = module.get<KloelToolDispatcherService>(KloelToolDispatcherService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const args = { name: 'Test', price: 99 };  describe('products.* aliases', () => {
    it('products.create forwards to create_product and reaches toolSaveProduct', async () => {
      const prodResult = await service.executeTool(DEFAULT_WS_ID, 'products.create', args);
      const directResult = await service.executeTool(DEFAULT_WS_ID, 'create_product', args);

      expect(prodResult).toEqual(directResult);
    });

    it('products.update forwards to update_product and reaches toolUpdateProduct', async () => {
      chatToolsService.toolUpdateProduct = jest.fn().mockResolvedValue({ success: true, updated: true });

      const dotted = await service.executeTool(DEFAULT_WS_ID, 'products.update', args);
      const direct = await service.executeTool(DEFAULT_WS_ID, 'update_product', args);

      expect(dotted).toEqual(direct);
    });

    it('products.upload_image forwards to upload_product_image', async () => {
      chatToolsService.toolUploadProductImage = jest.fn().mockResolvedValue({ success: true, url: 'https://img.test/x.png' });

      const dotted = await service.executeTool(DEFAULT_WS_ID, 'products.upload_image', args);
      const direct = await service.executeTool(DEFAULT_WS_ID, 'upload_product_image', args);

      expect(dotted).toEqual(direct);
    });
  });  describe('plans.* aliases', () => {
    it('plans.create forwards to create_plan', async () => {
      productSubTools.executeTool.mockResolvedValue({ success: true, plan: { id: 'p1' } });

      const dotted = await service.executeTool(DEFAULT_WS_ID, 'plans.create', args);
      const direct = await service.executeTool(DEFAULT_WS_ID, 'create_plan', args);

      expect(dotted).toEqual(direct);
    });

    it('plans.update forwards to update_plan', async () => {
      productSubTools.executeTool.mockResolvedValue({ success: true });

      const dotted = await service.executeTool(DEFAULT_WS_ID, 'plans.update', args);
      const direct = await service.executeTool(DEFAULT_WS_ID, 'update_plan', args);

      expect(dotted).toEqual(direct);
    });
  });  describe('checkouts.* aliases', () => {
    it('checkouts.create forwards to create_checkout', async () => {
      productSubTools.executeTool.mockResolvedValue({ success: true, checkout: { id: 'chk1' } });

      const dotted = await service.executeTool(DEFAULT_WS_ID, 'checkouts.create', args);
      const direct = await service.executeTool(DEFAULT_WS_ID, 'create_checkout', args);

      expect(dotted).toEqual(direct);
    });

    it('checkouts.update forwards to update_checkout', async () => {
      productSubTools.executeTool.mockResolvedValue({ success: true });

      const dotted = await service.executeTool(DEFAULT_WS_ID, 'checkouts.update', args);
      const direct = await service.executeTool(DEFAULT_WS_ID, 'update_checkout', args);

      expect(dotted).toEqual(direct);
    });
  });  describe('coupons.* aliases', () => {
    it('coupons.create forwards to create_coupon', async () => {
      productSubTools.executeTool.mockResolvedValue({ success: true, coupon: { id: 'c1' } });

      const dotted = await service.executeTool(DEFAULT_WS_ID, 'coupons.create', args);
      const direct = await service.executeTool(DEFAULT_WS_ID, 'create_coupon', args);

      expect(dotted).toEqual(direct);
    });

    it('coupons.delete forwards to delete_coupon', async () => {
      productSubTools.executeTool.mockResolvedValue({ success: true });

      const dotted = await service.executeTool(DEFAULT_WS_ID, 'coupons.delete', args);
      const direct = await service.executeTool(DEFAULT_WS_ID, 'delete_coupon', args);

      expect(dotted).toEqual(direct);
    });
  });
});
