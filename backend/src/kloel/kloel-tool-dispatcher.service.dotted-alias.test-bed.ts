import { ModulesContainer } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';

import { PlanLimitsService } from '../billing/plan-limits.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import { SalesService } from '../sales/sales.service';
import { CapabilityRegistryV2Service } from './capability-registry-v2/capability-registry-v2.service';
import { KloelBusinessConfigToolsService } from './kloel-business-config-tools.service';
import { KloelChatToolsService } from './kloel-chat-tools.service';
import { KloelCodeAnalysisService } from './kloel-code-analysis.service';
import { KloelCodeToolsService } from './kloel-code-tools.service';
import { KloelComposerService } from './kloel-composer.service';
import { KloelProductSubResourceToolsService } from './kloel-product-sub-resource-tools.service';
import { KloelToolDispatcherService } from './kloel-tool-dispatcher.service';
import { KloelWhatsAppToolsService } from './kloel-whatsapp-tools.service';
import {
  createAuditMock,
  createBizConfigToolsMock,
  createChatToolsMock,
  createCodeAnalysisMock,
  createCodeToolsMock,
  createComposerMock,
  createOpsAlertMock,
  createPlanLimitsMock,
  createPrismaMock,
  createWhatsappToolsMock,
  createSmartPaymentMock,
} from './kloel-tool-dispatcher.service.fixtures';
import { SmartPaymentService } from './smart-payment.service';
import type {
  DispatcherAuditMock,
  DispatcherBizConfigMock,
  DispatcherChatToolsMock,
  DispatcherCodeAnalysisMock,
  DispatcherCodeToolsMock,
  DispatcherComposerMock,
  DispatcherOpsAlertMock,
  DispatcherPlanLimitsMock,
  DispatcherPrismaMock,
  DispatcherWhatsappMock,
} from './kloel-tool-dispatcher.service.fixtures';

export type ProductSubToolsMock = { executeTool: jest.Mock };

export type SalesServiceMock = {
  createBoletoOrder: jest.Mock;
  createPixOrder: jest.Mock;
  createStripeCardLink: jest.Mock;
};

export type DispatcherTestBed = {
  service: KloelToolDispatcherService;
  prisma: DispatcherPrismaMock;
  planLimits: DispatcherPlanLimitsMock;
  chatToolsService: DispatcherChatToolsMock;
  bizConfigToolsService: DispatcherBizConfigMock;
  whatsappToolsService: DispatcherWhatsappMock;
  composerService: DispatcherComposerMock;
  auditService: DispatcherAuditMock;
  opsAlert: DispatcherOpsAlertMock;
  codeToolsService: DispatcherCodeToolsMock;
  codeAnalysisService: DispatcherCodeAnalysisMock;
  productSubTools: ProductSubToolsMock;
  salesService: SalesServiceMock;
};

export async function buildDispatcherTestBed(): Promise<DispatcherTestBed> {
  const prisma = createPrismaMock();
  const planLimits = createPlanLimitsMock();
  const chatToolsService = createChatToolsMock();
  const bizConfigToolsService = createBizConfigToolsMock();
  const whatsappToolsService = createWhatsappToolsMock();
  const composerService = createComposerMock();
  const auditService = createAuditMock();
  const opsAlert = createOpsAlertMock();
  const codeToolsService = createCodeToolsMock();
  const codeAnalysisService = createCodeAnalysisMock();
  const productSubTools: ProductSubToolsMock = {
    executeTool: jest.fn().mockResolvedValue({ success: true }),
  };
  const salesService: SalesServiceMock = {
    createBoletoOrder: jest.fn(),
    createPixOrder: jest.fn(),
    createStripeCardLink: jest.fn(),
  };

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
      { provide: SalesService, useValue: salesService },
      { provide: SmartPaymentService, useValue: createSmartPaymentMock() },
      { provide: ModulesContainer, useValue: new ModulesContainer() },
      CapabilityRegistryV2Service,
    ],
  }).compile();

  const service = module.get<KloelToolDispatcherService>(KloelToolDispatcherService);

  return {
    service,
    prisma,
    planLimits,
    chatToolsService,
    bizConfigToolsService,
    whatsappToolsService,
    composerService,
    auditService,
    opsAlert,
    codeToolsService,
    codeAnalysisService,
    productSubTools,
    salesService,
  };
}

export function objectContaining<T extends object>(sample: T): T {
  const matcher: unknown = expect.objectContaining(sample);
  return matcher as T;
}

export function stringMatching(pattern: RegExp): string {
  const matcher: unknown = expect.stringMatching(pattern);
  return matcher as string;
}

export function stringContaining(sample: string): string {
  const matcher: unknown = expect.stringContaining(sample);
  return matcher as string;
}
