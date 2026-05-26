import { Test, TestingModule } from '@nestjs/testing';
import { KloelToolDispatcherService } from './kloel-tool-dispatcher.service';
import { AccountService } from './account.service';
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
const DEFAULT_WS_ID = 'ws-1';

const createPrismaMock = () => ({
  workspace: {
    findUnique: jest.fn().mockResolvedValue({
      id: DEFAULT_WS_ID,
      providerSettings: {},
    }),
  },
  $transaction: jest
    .fn()
    .mockImplementation(<T>(fn: (tx: Record<string, unknown>) => T): T => fn({})),
});

const createPlanLimitsMock = () => ({
  ensureTokenBudget: jest.fn().mockResolvedValue(true),
  trackAiUsage: jest.fn().mockResolvedValue(undefined),
});

const createAccountServiceMock = () => ({
  updatePersonalData: jest
    .fn()
    .mockResolvedValue({ success: true, message: 'Personal data updated' }),
});

const createBizConfigMock = () => ({
  toolSaveBusinessInfo: jest.fn().mockResolvedValue({ success: true, message: 'ok' }),
  toolUploadDocument: jest.fn().mockResolvedValue({ success: true, message: 'ok' }),
});

const mockClass = () => ({ alertOnCriticalError: jest.fn() });
describe('KloelToolDispatcherService — account dotted-form aliases', () => {
  let service: KloelToolDispatcherService;
  let accountService: ReturnType<typeof createAccountServiceMock>;

  beforeEach(async () => {
    const prisma = createPrismaMock();
    const planLimits = createPlanLimitsMock();
    const bizConfigToolsService = createBizConfigMock();
    accountService = createAccountServiceMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KloelToolDispatcherService,
        { provide: PrismaService, useValue: prisma },
        { provide: PlanLimitsService, useValue: planLimits },
        { provide: AccountService, useValue: accountService },
        { provide: KloelChatToolsService, useValue: mockClass() },
        { provide: KloelBusinessConfigToolsService, useValue: bizConfigToolsService },
        { provide: KloelWhatsAppToolsService, useValue: mockClass() },
        { provide: KloelComposerService, useValue: mockClass() },
        { provide: AuditService, useValue: mockClass() },
        { provide: KloelCodeToolsService, useValue: mockClass() },
        { provide: KloelCodeAnalysisService, useValue: mockClass() },
        { provide: OpsAlertService, useValue: mockClass() },
      ],
    }).compile();

    service = module.get<KloelToolDispatcherService>(KloelToolDispatcherService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });
  describe('account.update_personal → update_personal_data', () => {
    it('forwards account.update_personal to update_personal_data', async () => {
      await service.executeTool(DEFAULT_WS_ID, 'account.update_personal', {
        name: 'Novo Nome',
        email: 'novo@test.com',
      });

      expect(accountService.updatePersonalData).toHaveBeenCalledTimes(1);
      expect(accountService.updatePersonalData).toHaveBeenCalledWith(DEFAULT_WS_ID, {
        name: 'Novo Nome',
        email: 'novo@test.com',
      });
    });

    it('update_personal_data calls AccountService.updatePersonalData directly', async () => {
      const result = await service.executeTool(DEFAULT_WS_ID, 'update_personal_data', {
        name: 'Nome',
        email: 'email@test.com',
        phone: '11999999999',
      });

      expect(result.success).toBe(true);
      expect(accountService.updatePersonalData).toHaveBeenCalledWith(DEFAULT_WS_ID, {
        name: 'Nome',
        email: 'email@test.com',
        phone: '11999999999',
      });
    });
  });
  describe('account.update_fiscal → update_fiscal_data', () => {
    it('forwards account.update_fiscal to update_fiscal_data via executeTool re-entry', async () => {
      const spy = jest.spyOn(service, 'executeTool');

      await service.executeTool(DEFAULT_WS_ID, 'account.update_fiscal', {
        document: '12345678000199',
        personType: 'PJ',
      });

      expect(spy).toHaveBeenCalledWith(
        DEFAULT_WS_ID,
        'update_fiscal_data',
        { document: '12345678000199', personType: 'PJ' },
        undefined,
      );
    });
  });
  describe('account.upload_document → upload_document', () => {
    it('forwards account.upload_document to upload_document via executeTool re-entry', async () => {
      const spy = jest.spyOn(service, 'executeTool');

      await service.executeTool(DEFAULT_WS_ID, 'account.upload_document', {
        documentType: 'identity',
      });

      expect(spy).toHaveBeenCalledWith(
        DEFAULT_WS_ID,
        'upload_document',
        { documentType: 'identity' },
        undefined,
      );
    });
  });
});
