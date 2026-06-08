// Shared setup for kloel-tool-dispatcher chat-tools spec splits.
// This file intentionally does NOT match Jest's *.spec.ts pattern so it is
// not picked up as a test suite; it is imported by each domain spec.

import { ModulesContainer } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { KloelToolDispatcherService } from './kloel-tool-dispatcher.service';
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
import { AccountService } from './account.service';
import { CapabilityRegistryV2Service } from './capability-registry-v2/capability-registry-v2.service';
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
  createSmartPaymentMock,
} from './kloel-tool-dispatcher.service.fixtures';
import { SmartPaymentService } from './smart-payment.service';
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
  DispatcherAccountMock,
} from './kloel-tool-dispatcher.service.fixtures';

export interface ChatToolsHarness {
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
  accountService: DispatcherAccountMock;
}

export async function buildChatToolsHarness(): Promise<ChatToolsHarness> {
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
  const accountService = createAccountMock();

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
      { provide: AccountService, useValue: accountService },
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
    accountService,
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
