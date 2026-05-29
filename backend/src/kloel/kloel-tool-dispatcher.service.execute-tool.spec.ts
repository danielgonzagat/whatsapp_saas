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

describe('KloelToolDispatcherService (executeTool)', () => {
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
    accountService = createAccountMock();
    selfHealthService = createSelfHealthMock();
    selfGapsService = createSelfGapsMock();
    capRegistryV2Service = createCapRegistryV2Mock();

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
        { provide: SelfHealthService, useValue: selfHealthService },
        { provide: SelfGapsService, useValue: selfGapsService },
        { provide: CapabilityRegistryV2Service, useValue: capRegistryV2Service },
        { provide: SmartPaymentService, useValue: createSmartPaymentMock() },
      ],
    }).compile();

    service = module.get<KloelToolDispatcherService>(KloelToolDispatcherService);
  });
  afterEach(() => {
    jest.clearAllMocks();
  });
  describe('executeTool', () => {
    it('returns error when workspaceId is empty', async () => {
      const result = await service.executeTool('', 'save_product', {});
      expect(result.success).toBe(false);
      expect(result.error).toBe('workspace_id_required');
    });
    it('returns error when workspace not found', async () => {
      prisma.workspace.findUnique.mockResolvedValueOnce(null);

      const result = await service.executeTool('unknown-ws', 'save_product', {});
      expect(result.success).toBe(false);
      expect(result.error).toBe('workspace_not_found');
    });
    it('returns error when billing is suspended', async () => {
      prisma.workspace.findUnique.mockResolvedValueOnce({
        id: DEFAULT_WS_ID,
        providerSettings: { billingSuspended: true },
      });
      const result = await service.executeTool(DEFAULT_WS_ID, 'save_product', {});
      expect(result.success).toBe(false);
      expect(result.error).toBe('billing_suspended');
    });
    it('returns error for unknown tool', async () => {
      const result = await service.executeTool(DEFAULT_WS_ID, 'unknown_tool', {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('Ferramenta desconhecida');
    });
    describe('whatsapp tools routing', () => {
      it('routes connect_whatsapp to whatsappToolsService', async () => {
        await service.executeTool(DEFAULT_WS_ID, 'connect_whatsapp', {});
        expect(whatsappToolsService.toolConnectWhatsapp).toHaveBeenCalledWith(DEFAULT_WS_ID);
      });
      it('routes get_whatsapp_status to whatsappToolsService', async () => {
        await service.executeTool(DEFAULT_WS_ID, 'get_whatsapp_status', {});
        expect(whatsappToolsService.toolGetWhatsAppStatus).toHaveBeenCalledWith(DEFAULT_WS_ID);
      });
      it('routes send_whatsapp_message to whatsappToolsService', async () => {
        await service.executeTool(DEFAULT_WS_ID, 'send_whatsapp_message', {
          phone: '123',
          message: 'Hi',
        });
        expect(whatsappToolsService.toolSendWhatsAppMessage).toHaveBeenCalledWith(DEFAULT_WS_ID, {
          phone: '123',
          message: 'Hi',
        });
      });
      it('routes list_whatsapp_contacts to whatsappToolsService', async () => {
        await service.executeTool(DEFAULT_WS_ID, 'list_whatsapp_contacts', {});
        expect(whatsappToolsService.toolListWhatsAppContacts).toHaveBeenCalledWith(
          DEFAULT_WS_ID,
          {},
        );
      });
      it('routes send_audio to whatsappToolsService', async () => {
        await service.executeTool(DEFAULT_WS_ID, 'send_audio', {
          phone: '123',
          audioUrl: 'url',
        });
        expect(whatsappToolsService.toolSendAudio).toHaveBeenCalledWith(DEFAULT_WS_ID, {
          phone: '123',
          audioUrl: 'url',
        });
      });
      it('routes transcribe_audio to whatsappToolsService', async () => {
        await service.executeTool(DEFAULT_WS_ID, 'transcribe_audio', { audioUrl: 'url' });
        expect(whatsappToolsService.toolTranscribeAudio).toHaveBeenCalledWith(DEFAULT_WS_ID, {
          audioUrl: 'url',
        });
      });
    });
    describe('business config tools routing', () => {
      it('routes get_lead_details to bizConfigToolsService', async () => {
        const result = await service.executeTool(DEFAULT_WS_ID, 'get_lead_details', {
          leadId: 'l-1',
        });
        expect(result.success).toBe(true);
        expect(bizConfigToolsService.toolGetLeadDetails).toHaveBeenCalledWith(DEFAULT_WS_ID, {
          leadId: 'l-1',
        });
      });
      it('routes save_business_info to bizConfigToolsService', async () => {
        const result = await service.executeTool(DEFAULT_WS_ID, 'save_business_info', {
          name: 'Biz',
        });
        expect(result.success).toBe(true);
        expect(bizConfigToolsService.toolSaveBusinessInfo).toHaveBeenCalledWith(DEFAULT_WS_ID, {
          name: 'Biz',
        });
      });
      it('routes save_business_info with businessHours and socialChannels coerced', async () => {
        const result = await service.executeTool(DEFAULT_WS_ID, 'save_business_info', {
          businessName: 'Biz',
          businessHours: { weekday: { start: '08:00', end: '18:00' } },
          socialChannels: { instagram: '@biz' },
        });
        expect(result.success).toBe(true);
        expect(bizConfigToolsService.toolSaveBusinessInfo).toHaveBeenCalledWith(DEFAULT_WS_ID, {
          businessName: 'Biz',
          businessHours: { weekday: { start: '08:00', end: '18:00' } },
          socialChannels: { instagram: '@biz' },
        });
      });
      it('routes upload_document to bizConfigToolsService', async () => {
        const result = await service.executeTool(DEFAULT_WS_ID, 'upload_document', {
          docType: 'identidade',
        });
        expect(result.success).toBe(true);
        expect(bizConfigToolsService.toolUploadDocument).toHaveBeenCalledWith(DEFAULT_WS_ID, {
          docType: 'identidade',
        });
      });
      it('returns document_service_unavailable when toolUploadDocument is absent', async () => {
        const originalUpload = bizConfigToolsService.toolUploadDocument;
        (bizConfigToolsService as Record<string, unknown>).toolUploadDocument = undefined;

        const result = await service.executeTool(DEFAULT_WS_ID, 'upload_document', {
          docType: 'identidade',
        });
        expect(result.success).toBe(false);
        expect(result.error).toBe('document_service_unavailable');

        (bizConfigToolsService as Record<string, unknown>).toolUploadDocument = originalUpload;
      });
      it('routes change_plan to bizConfigToolsService', async () => {
        const result = await service.executeTool(DEFAULT_WS_ID, 'change_plan', { plan: 'pro' });
        expect(result.success).toBe(true);
      });
    });
    describe('create_payment_link', () => {
      it('returns smart_payment_unavailable when SmartPaymentService is absent', async () => {
        const moduleWithoutPayment: TestingModule = await Test.createTestingModule({
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
            { provide: SelfHealthService, useValue: selfHealthService },
            { provide: SelfGapsService, useValue: selfGapsService },
            { provide: CapabilityRegistryV2Service, useValue: capRegistryV2Service },
          ],
        }).compile();

        const serviceNoPayment = moduleWithoutPayment.get<KloelToolDispatcherService>(
          KloelToolDispatcherService,
        );

        const result = await serviceNoPayment.executeTool(DEFAULT_WS_ID, 'create_payment_link', {
          amount: 99.9,
          description: 'Produto',
        });
        expect(result.success).toBe(false);
        expect(result.error).toBe('smart_payment_unavailable');
      });
      it('routes create_payment_link and writes audit log', async () => {
        capRegistryV2Service.get.mockReturnValueOnce({
          id: 'create_payment_link',
          title: 'Criar link de pagamento',
          emits: ['checkout.generated'],
          evidenceUrlBuilder: '/pagamentos/${orderId}',
        });
        Object.assign(capRegistryV2Service, {
          createReceipt: jest.fn(
            (params: {
              capabilityId: string;
              title: string;
              context: { workspaceId: string; actorId: string; idempotencyKey: string };
              inputs: Record<string, unknown>;
              outputs: Record<string, unknown>;
              domainEvents: string[];
              auditLogId: string;
              evidenceUrl?: string;
              durationMs: number;
              success: boolean;
            }) => ({
              capabilityId: params.capabilityId,
              title: params.title,
              workspaceId: params.context.workspaceId,
              actorId: params.context.actorId,
              inputs: params.inputs,
              outputs: params.outputs,
              domainEvents: params.domainEvents,
              auditLogId: params.auditLogId,
              evidenceUrl: params.evidenceUrl,
              timestamp: '2026-05-27T00:00:00.000Z',
              durationMs: params.durationMs,
              idempotencyKey: params.context.idempotencyKey,
              success: params.success,
            }),
          ),
        });
        chatToolsService.toolCreatePaymentLink = jest.fn().mockResolvedValue({
          success: true,
          paymentUrl: 'https://pay.test/checkout',
          paymentId: 'pay-1',
        });
        const result = await service.executeTool(DEFAULT_WS_ID, 'create_payment_link', {
          amount: 99.9,
          description: 'Produto',
        });
        expect(result).toEqual(expect.objectContaining({ success: true }));
        expect(chatToolsService.toolCreatePaymentLink).toHaveBeenCalledWith(DEFAULT_WS_ID, {
          amount: 99.9,
          description: 'Produto',
          executionPath: 'dispatcher',
        });
        expect(result.receipt).toEqual(
          expect.objectContaining({
            capabilityId: 'create_payment_link',
            success: true,
          }),
        );
        expect(prisma.$transaction).toHaveBeenCalled();
      });
    });
    describe('search_web', () => {
      it('routes search_web to composer service', async () => {
        const result = await service.executeTool(DEFAULT_WS_ID, 'search_web', {
          query: 'test query',
        });
        expect(result.success).toBe(true);
        expect(composerService.searchWeb).toHaveBeenCalledWith('test query');
        expect(planLimits.ensureTokenBudget).toHaveBeenCalledWith(DEFAULT_WS_ID);
      });
      it('returns error for missing query', async () => {
        const result = await service.executeTool(DEFAULT_WS_ID, 'search_web', {});
        expect(result.success).toBe(false);
        expect(result.error).toBe('missing_query');
      });
      it('returns search_unavailable when composerService.searchWeb is absent', async () => {
        const originalSearchWeb = composerService.searchWeb;
        (composerService as Record<string, unknown>).searchWeb = undefined;

        const result = await service.executeTool(DEFAULT_WS_ID, 'search_web', {
          query: 'test query',
        });
        expect(result.success).toBe(false);
        expect(result.error).toBe('search_unavailable');

        (composerService as Record<string, unknown>).searchWeb = originalSearchWeb;
      });
    });

    describe('toggle_theme / ui.theme', () => {
      it('returns workspace_service_unavailable when WorkspaceService is absent', async () => {
        const result = await service.executeTool(DEFAULT_WS_ID, 'toggle_theme', {
          theme: 'dark',
        });
        expect(result.success).toBe(false);
        expect(result.error).toBe('workspace_service_unavailable');
      });

      it('rejects invalid theme value', async () => {
        const moduleWithWs: TestingModule = await Test.createTestingModule({
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
            { provide: SelfHealthService, useValue: selfHealthService },
            { provide: SelfGapsService, useValue: selfGapsService },
            { provide: CapabilityRegistryV2Service, useValue: capRegistryV2Service },
            { provide: SmartPaymentService, useValue: createSmartPaymentMock() },
            {
              provide: WorkspaceService,
              useValue: {
                updateThemePreference: jest.fn().mockResolvedValue({ theme: 'light' }),
              },
            },
          ],
        }).compile();

        const svc = moduleWithWs.get<KloelToolDispatcherService>(KloelToolDispatcherService);
        const result = await svc.executeTool(DEFAULT_WS_ID, 'toggle_theme', {
          theme: 'neon',
        });
        expect(result.success).toBe(false);
        expect(result.error).toBe('invalid_theme');
      });

      it('stores light theme via WorkspaceService', async () => {
        const wsMock = {
          updateThemePreference: jest.fn().mockResolvedValue({ theme: 'light' }),
        };
        const moduleWithWs: TestingModule = await Test.createTestingModule({
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
            { provide: SelfHealthService, useValue: selfHealthService },
            { provide: SelfGapsService, useValue: selfGapsService },
            { provide: CapabilityRegistryV2Service, useValue: capRegistryV2Service },
            { provide: SmartPaymentService, useValue: createSmartPaymentMock() },
            { provide: WorkspaceService, useValue: wsMock },
          ],
        }).compile();

        const svc = moduleWithWs.get<KloelToolDispatcherService>(KloelToolDispatcherService);
        const result = await svc.executeTool(DEFAULT_WS_ID, 'toggle_theme', {
          theme: 'light',
        });
        expect(result.success).toBe(true);
        expect(result.theme).toBe('light');
        expect(wsMock.updateThemePreference).toHaveBeenCalledWith(DEFAULT_WS_ID, 'light');
      });

      it('ui.theme routes identically to toggle_theme', async () => {
        const wsMock = {
          updateThemePreference: jest.fn().mockResolvedValue({ theme: 'dark' }),
        };
        const moduleWithWs: TestingModule = await Test.createTestingModule({
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
            { provide: SelfHealthService, useValue: selfHealthService },
            { provide: SelfGapsService, useValue: selfGapsService },
            { provide: CapabilityRegistryV2Service, useValue: capRegistryV2Service },
            { provide: SmartPaymentService, useValue: createSmartPaymentMock() },
            { provide: WorkspaceService, useValue: wsMock },
          ],
        }).compile();

        const svc = moduleWithWs.get<KloelToolDispatcherService>(KloelToolDispatcherService);
        const result = await svc.executeTool(DEFAULT_WS_ID, 'ui.theme', { theme: 'dark' });
        expect(result.success).toBe(true);
        expect(result.theme).toBe('dark');
        expect(wsMock.updateThemePreference).toHaveBeenCalledWith(DEFAULT_WS_ID, 'dark');
      });
    });

    describe('get_abandonments', () => {
      it('returns report_service_unavailable when ReportService is absent', async () => {
        const result = await service.executeTool(DEFAULT_WS_ID, 'get_abandonments', {});
        expect(result.success).toBe(false);
        expect(result.error).toBe('report_service_unavailable');
      });

      it('routes get_abandonments to reportService.abandonments', async () => {
        const reportMock = {
          abandonments: jest
            .fn()
            .mockResolvedValue({ items: [{ id: 'l-1', name: 'Lead' }], total: 1 }),
          operations: jest.fn(),
          pipeline: jest.fn(),
        };
        const moduleWithReport: TestingModule = await Test.createTestingModule({
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
            { provide: SelfHealthService, useValue: selfHealthService },
            { provide: SelfGapsService, useValue: selfGapsService },
            { provide: CapabilityRegistryV2Service, useValue: capRegistryV2Service },
            { provide: SmartPaymentService, useValue: createSmartPaymentMock() },
            { provide: ReportService, useValue: reportMock },
          ],
        }).compile();

        const svc = moduleWithReport.get<KloelToolDispatcherService>(KloelToolDispatcherService);
        const result = await svc.executeTool(DEFAULT_WS_ID, 'get_abandonments', {});
        expect(result.success).toBe(true);
        expect(result.items).toEqual([{ id: 'l-1', name: 'Lead' }]);
        expect(result.total).toBe(1);
        expect(reportMock.abandonments).toHaveBeenCalledWith(DEFAULT_WS_ID);
      });
    });
  });
});
