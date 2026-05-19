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

import { KloelChatToolsService } from './kloel-chat-tools.service';
import { KloelBusinessConfigToolsService } from './kloel-business-config-tools.service';
import { KloelWhatsAppToolsService } from './kloel-whatsapp-tools.service';
import { KloelComposerService } from './kloel-composer.service';
import { AuditService } from '../audit/audit.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import {
  createPrismaMock,
  createPlanLimitsMock,
  createChatToolsMock,
  createBizConfigToolsMock,
  createWhatsappToolsMock,
  createComposerMock,
  createAuditMock,
  createOpsAlertMock,
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
} from './kloel-tool-dispatcher.service.fixtures';

describe('KloelToolDispatcherService approval execution', () => {
  let service: KloelToolDispatcherService;
  let prisma: DispatcherPrismaMock;
  let planLimits: DispatcherPlanLimitsMock;
  let chatToolsService: DispatcherChatToolsMock;
  let bizConfigToolsService: DispatcherBizConfigMock;
  let whatsappToolsService: DispatcherWhatsappMock;
  let composerService: DispatcherComposerMock;
  let auditService: DispatcherAuditMock;
  let opsAlert: DispatcherOpsAlertMock;

  beforeEach(async () => {
    prisma = createPrismaMock();
    planLimits = createPlanLimitsMock();
    chatToolsService = createChatToolsMock();
    bizConfigToolsService = createBizConfigToolsMock();
    whatsappToolsService = createWhatsappToolsMock();
    composerService = createComposerMock();
    auditService = createAuditMock();
    opsAlert = createOpsAlertMock();

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
        { provide: OpsAlertService, useValue: opsAlert },
      ],
    }).compile();

    service = module.get<KloelToolDispatcherService>(KloelToolDispatcherService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('creates approval request for create_campaign', async () => {
    const result = await service.executeTool(DEFAULT_WS_ID, 'create_campaign', {
      name: 'Campanha Teste',
      targetAudience: 'todos',
    });

    expect(result.success).toBe(true);
    expect(result.approvalRequired).toBe(true);
    expect(prisma.approvalRequest.create).toHaveBeenCalledWith({
      data: {
        workspaceId: DEFAULT_WS_ID,
        kind: 'kloel_tool:create_campaign',
        scope: 'workspace',
        entityType: 'KloelTool',
        entityId: 'create_campaign',
        state: 'OPEN',
        title: 'Aprovar criacao de campanha pela CIA',
        prompt: expect.stringContaining('"Campanha Teste"'),
        payload: {
          toolName: 'create_campaign',
          args: { name: 'Campanha Teste', targetAudience: 'todos' },
          requestedByUserId: null,
          risk: 'high',
          requiresApproval: true,
        },
      },
      select: {
        id: true,
        kind: true,
        state: true,
        title: true,
        createdAt: true,
      },
    });
  });

  it('creates approval request for change_plan with the requested newPlan in the owner prompt', async () => {
    const result = await service.executeTool(
      DEFAULT_WS_ID,
      'change_plan',
      { newPlan: 'enterprise', immediate: true },
      'owner-1',
    );

    expect(result.success).toBe(true);
    expect(result.approvalRequired).toBe(true);
    expect(prisma.approvalRequest.create).toHaveBeenCalledWith({
      data: {
        workspaceId: DEFAULT_WS_ID,
        kind: 'kloel_tool:change_plan',
        scope: 'workspace',
        entityType: 'KloelTool',
        entityId: 'change_plan',
        state: 'OPEN',
        title: 'Aprovar alteracao de plano pela CIA',
        prompt: expect.stringContaining('"enterprise"'),
        payload: {
          toolName: 'change_plan',
          args: { newPlan: 'enterprise', immediate: true },
          requestedByUserId: 'owner-1',
          risk: 'high',
          requiresApproval: true,
        },
      },
      select: {
        id: true,
        kind: true,
        state: true,
        title: true,
        createdAt: true,
      },
    });
  });

  it('scopes create_campaign approval to the provided workspace', async () => {
    await service.executeTool('ws-isolated', 'create_campaign', {
      name: 'C',
      targetAudience: 'all',
    });

    expect(prisma.approvalRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ workspaceId: 'ws-isolated' }),
      select: expect.objectContaining({ id: true }),
    });
  });

  it('returns not executed when approval is missing', async () => {
    prisma.approvalRequest.findFirst.mockResolvedValueOnce(null);

    const result = await service.executeApprovedApprovalRequest({
      workspaceId: DEFAULT_WS_ID,
      approvalRequestId: 'ap-1',
    });

    expect(result.success).toBe(false);
    expect(result.executed).toBe(false);
  });

  it('returns not executed when kind does not match payload', async () => {
    prisma.approvalRequest.findFirst.mockResolvedValueOnce({
      id: 'ap-1',
      workspaceId: DEFAULT_WS_ID,
      kind: 'kloel_tool:create_campaign',
      state: 'APPROVED',
      payload: { toolName: 'other_tool', args: {} },
      createdAt: new Date(),
    });

    const result = await service.executeApprovedApprovalRequest({
      workspaceId: DEFAULT_WS_ID,
      approvalRequestId: 'ap-1',
    });

    expect(result.success).toBe(true);
    expect(result.executed).toBe(false);
  });

  it('executes create_campaign for approved request', async () => {
    prisma.approvalRequest.findFirst.mockResolvedValueOnce({
      id: 'ap-1',
      workspaceId: DEFAULT_WS_ID,
      kind: 'kloel_tool:create_campaign',
      state: 'APPROVED',
      payload: {
        toolName: 'create_campaign',
        args: { name: 'Campanha Aprovada', targetAudience: 'all' },
      },
      createdAt: new Date(),
    });

    const result = await service.executeApprovedApprovalRequest({
      workspaceId: DEFAULT_WS_ID,
      approvalRequestId: 'ap-1',
      userId: 'user-1',
    });

    expect(result.success).toBe(true);
    expect(result.executed).toBe(true);
    expect(result.toolName).toBe('create_campaign');
    expect(bizConfigToolsService.toolCreateCampaign).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      name: 'Campanha Aprovada',
      targetAudience: 'all',
    });
    expect(prisma.approvalRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 'ap-1', workspaceId: DEFAULT_WS_ID, state: 'APPROVED' },
      data: expect.objectContaining({ state: 'COMPLETED' }),
    });
  });

  it('marks approval as failed when campaign execution throws', async () => {
    prisma.approvalRequest.findFirst.mockResolvedValueOnce({
      id: 'ap-1',
      workspaceId: DEFAULT_WS_ID,
      kind: 'kloel_tool:create_campaign',
      state: 'APPROVED',
      payload: { toolName: 'create_campaign', args: { name: 'Failing Campaign' } },
      createdAt: new Date(),
    });
    bizConfigToolsService.toolCreateCampaign = jest
      .fn()
      .mockRejectedValue(new Error('Campaign creation failed'));

    await expect(
      service.executeApprovedApprovalRequest({
        workspaceId: DEFAULT_WS_ID,
        approvalRequestId: 'ap-1',
      }),
    ).rejects.toThrow('Campaign creation failed');

    expect(prisma.approvalRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 'ap-1', workspaceId: DEFAULT_WS_ID, state: 'APPROVED' },
      data: expect.objectContaining({ state: 'FAILED' }),
    });
  });
});
