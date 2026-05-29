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
import { WorkspaceService } from '../workspaces/workspace.service';
import { ReportService } from './report.service';
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
} from './kloel-tool-dispatcher.service.fixtures';

async function buildDispatcher(extra: Array<{ provide: unknown; useValue: unknown }> = []) {
  const prisma = createPrismaMock();
  const baseProviders: Array<{ provide: unknown; useValue: unknown }> = [
    { provide: PrismaService, useValue: prisma },
    { provide: PlanLimitsService, useValue: createPlanLimitsMock() },
    { provide: KloelChatToolsService, useValue: createChatToolsMock() },
    { provide: KloelBusinessConfigToolsService, useValue: createBizConfigToolsMock() },
    { provide: KloelWhatsAppToolsService, useValue: createWhatsappToolsMock() },
    { provide: KloelComposerService, useValue: createComposerMock() },
    { provide: AuditService, useValue: createAuditMock() },
    { provide: KloelCodeToolsService, useValue: createCodeToolsMock() },
    { provide: KloelCodeAnalysisService, useValue: createCodeAnalysisMock() },
    { provide: OpsAlertService, useValue: createOpsAlertMock() },
    { provide: AccountService, useValue: createAccountMock() },
    { provide: SelfHealthService, useValue: createSelfHealthMock() },
    { provide: SelfGapsService, useValue: createSelfGapsMock() },
    { provide: CapabilityRegistryV2Service, useValue: createCapRegistryV2Mock() },
    { provide: SmartPaymentService, useValue: createSmartPaymentMock() },
  ];
  const module: TestingModule = await Test.createTestingModule({
    providers: [KloelToolDispatcherService, ...(baseProviders as never[]), ...(extra as never[])],
  }).compile();
  return module.get<KloelToolDispatcherService>(KloelToolDispatcherService);
}

describe('KloelToolDispatcherService toggle_theme / ui.theme', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns workspace_service_unavailable when WorkspaceService is absent', async () => {
    const svc = await buildDispatcher();
    const result = await svc.executeTool(DEFAULT_WS_ID, 'toggle_theme', { theme: 'dark' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('workspace_service_unavailable');
  });

  it('rejects invalid theme value', async () => {
    const wsMock = { updateThemePreference: jest.fn().mockResolvedValue({ theme: 'light' }) };
    const svc = await buildDispatcher([{ provide: WorkspaceService, useValue: wsMock }]);
    const result = await svc.executeTool(DEFAULT_WS_ID, 'toggle_theme', { theme: 'neon' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('invalid_theme');
  });

  it('stores light theme via WorkspaceService', async () => {
    const wsMock = { updateThemePreference: jest.fn().mockResolvedValue({ theme: 'light' }) };
    const svc = await buildDispatcher([{ provide: WorkspaceService, useValue: wsMock }]);
    const result = await svc.executeTool(DEFAULT_WS_ID, 'toggle_theme', { theme: 'light' });
    expect(result.success).toBe(true);
    expect(result.theme).toBe('light');
    expect(wsMock.updateThemePreference).toHaveBeenCalledWith(DEFAULT_WS_ID, 'light');
  });

  it('ui.theme routes identically to toggle_theme', async () => {
    const wsMock = { updateThemePreference: jest.fn().mockResolvedValue({ theme: 'dark' }) };
    const svc = await buildDispatcher([{ provide: WorkspaceService, useValue: wsMock }]);
    const result = await svc.executeTool(DEFAULT_WS_ID, 'ui.theme', { theme: 'dark' });
    expect(result.success).toBe(true);
    expect(result.theme).toBe('dark');
    expect(wsMock.updateThemePreference).toHaveBeenCalledWith(DEFAULT_WS_ID, 'dark');
  });
});

describe('KloelToolDispatcherService get_abandonments', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns report_service_unavailable when ReportService is absent', async () => {
    const svc = await buildDispatcher();
    const result = await svc.executeTool(DEFAULT_WS_ID, 'get_abandonments', {});
    expect(result.success).toBe(false);
    expect(result.error).toBe('report_service_unavailable');
  });

  it('routes get_abandonments to reportService.abandonments', async () => {
    const reportMock = {
      abandonments: jest.fn().mockResolvedValue({ items: [{ id: 'l-1', name: 'Lead' }], total: 1 }),
      operations: jest.fn(),
      pipeline: jest.fn(),
    };
    const svc = await buildDispatcher([{ provide: ReportService, useValue: reportMock }]);
    const result = await svc.executeTool(DEFAULT_WS_ID, 'get_abandonments', {});
    expect(result.success).toBe(true);
    expect(result.items).toEqual([{ id: 'l-1', name: 'Lead' }]);
    expect(result.total).toBe(1);
    expect(reportMock.abandonments).toHaveBeenCalledWith(DEFAULT_WS_ID);
  });
});
