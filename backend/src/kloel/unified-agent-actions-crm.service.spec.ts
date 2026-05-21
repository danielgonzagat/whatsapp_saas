import { Test, TestingModule } from '@nestjs/testing';
import { UnifiedAgentActionsCrmService } from './unified-agent-actions-crm.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppProviderRegistry } from '../whatsapp/providers/provider-registry';
import { OpsAlertService } from '../observability/ops-alert.service';
jest.mock('../queue/queue', () => ({
  flowQueue: {
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
  },
}));
jest.mock('./unified-agent-actions-crm.helpers', () => ({
  actionImportContacts: jest.fn().mockResolvedValue({
    success: true,
    message: '5 contatos importados com sucesso',
    total: 5,
    created: 5,
  }),
}));
jest.mock('../common/kloel-colors', () => ({
  TAG_DEFAULT_COLORS: {
    CRM_AUTO_BLUE: '#0000FF',
  },
}));
const { flowQueue } = jest.requireMock('../queue/queue');
type CrmPrismaMock = {
  contact: {
    findFirst: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    upsert: jest.Mock;
  };
  tag: { findFirst: jest.Mock; create: jest.Mock };
  followUp: { findFirst: jest.Mock; create: jest.Mock };
  flow: { findFirst: jest.Mock };
  conversation: { findFirst: jest.Mock; updateMany: jest.Mock };
  kloelMemory: { findMany: jest.Mock };
  autopilotEvent: { create: jest.Mock };
  workspace: { findUnique: jest.Mock; update: jest.Mock };
  $transaction: jest.Mock;
};
describe('UnifiedAgentActionsCrmService', () => {
  let service: UnifiedAgentActionsCrmService;
  let prisma: CrmPrismaMock;
  let providerRegistry: Pick<WhatsAppProviderRegistry, 'startSession'>;
  let opsAlert: Pick<OpsAlertService, 'alertOnCriticalError'>;
  const wsId = 'ws-1';
  const contactId = 'c-1';
  beforeEach(async () => {
    prisma = {
      contact: {
        findFirst: jest.fn().mockResolvedValue({ phone: '5511999999999' }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        upsert: jest.fn().mockResolvedValue({}),
      },
      tag: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 't-1',
          name: 'vip',
          color: '#0000FF',
        }),
      },
      followUp: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      flow: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'f-1',
          name: 'Flow Test',
          isActive: true,
        }),
      },
      conversation: {
        findFirst: jest.fn().mockResolvedValue({ id: 'conv-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      kloelMemory: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'm-1',
            key: 'vendas',
            value: { data: 'info' },
            category: 'scripts',
          },
        ]),
      },
      autopilotEvent: {
        create: jest.fn().mockResolvedValue({}),
      },
      workspace: {
        findUnique: jest.fn().mockResolvedValue({
          id: wsId,
          providerSettings: {},
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn().mockImplementation((arg: unknown) => {
        if (typeof arg === 'function') {
          return arg(prisma);
        }
        return Promise.resolve(undefined);
      }),
    };
    providerRegistry = {
      startSession: jest.fn().mockResolvedValue({
        success: true,
        message: 'Session started',
        authUrl: 'https://auth.meta.com',
      }),
    };
    opsAlert = {
      alertOnCriticalError: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnifiedAgentActionsCrmService,
        { provide: PrismaService, useValue: prisma },
        { provide: WhatsAppProviderRegistry, useValue: providerRegistry },
        { provide: OpsAlertService, useValue: opsAlert },
      ],
    }).compile();
    service = module.get<UnifiedAgentActionsCrmService>(UnifiedAgentActionsCrmService);
  });
  afterEach(() => {
    jest.clearAllMocks();
  });
  describe('actionUpdateLeadStatus', () => {
    it('updates contact status within transaction', async () => {
      const result = await service.actionUpdateLeadStatus(wsId, contactId, {
        status: 'qualified',
        intent: 'purchase',
      });
      expect(result.success).toBe(true);
      expect(result.status).toBe('qualified');
      expect(prisma.$transaction).toHaveBeenCalled();
    });
    it('returns error when no contactId provided', async () => {
      const result = await service.actionUpdateLeadStatus(wsId, '', {});
      expect(result.success).toBe(false);
      expect(result.error).toBe('No contact ID');
    });
    it('scopes update to workspaceId', async () => {
      await service.actionUpdateLeadStatus('ws-tenant', contactId, {
        status: 'lead',
      });
      expect(prisma.contact.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: contactId, workspaceId: 'ws-tenant' },
        }),
      );
    });
  });
  describe('actionAddTag', () => {
    it('adds tag to contact when tag does not exist', async () => {
      const result = await service.actionAddTag(wsId, contactId, {
        tag: 'vip',
      });
      expect(result.success).toBe(true);
      expect(result.tag).toBe('vip');
      expect(prisma.tag.create).toHaveBeenCalled();
    });
    it('reuses existing tag', async () => {
      prisma.tag.findFirst.mockResolvedValue({
        id: 't-existing',
        name: 'existing',
        color: '#0000FF',
      });
      const result = await service.actionAddTag(wsId, contactId, {
        tag: 'existing',
      });
      expect(result.success).toBe(true);
      expect(prisma.tag.create).not.toHaveBeenCalled();
    });
    it('returns error when no contactId', async () => {
      const result = await service.actionAddTag(wsId, '', { tag: 'vip' });
      expect(result.success).toBe(false);
    });
  });
  describe('actionScheduleFollowup', () => {
    const phone = '5511999999999';
    it('creates follow-up and logs autopilot event', async () => {
      const result = await service.actionScheduleFollowup(wsId, contactId, phone, {
        delayHours: 48,
        message: 'Olá, ainda tem interesse?',
      });
      expect(result.success).toBe(true);
      expect(prisma.followUp.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workspaceId: wsId,
            contactId,
          }),
        }),
      );
    });
    it('deduplicates follow-ups within 5 minutes', async () => {
      prisma.followUp.findFirst.mockResolvedValue({
        id: 'fu-1',
        scheduledFor: new Date(),
      });
      const result = await service.actionScheduleFollowup(wsId, contactId, phone, {
        delayHours: 1,
      });
      expect(result.deduplicated).toBe(true);
      expect(prisma.followUp.create).not.toHaveBeenCalled();
    });
    it('scopes follow-up query to workspaceId', async () => {
      await service.actionScheduleFollowup('ws-tenant', contactId, phone, {
        delayHours: 24,
      });
      expect(prisma.followUp.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workspaceId: 'ws-tenant' }),
        }),
      );
    });
  });
  describe('actionTransferToHuman', () => {
    it('transfers conversation to human mode', async () => {
      const result = await service.actionTransferToHuman(wsId, contactId, {
        reason: 'Complex issue',
        priority: 'high',
      });
      expect(result.success).toBe(true);
      expect(prisma.conversation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { mode: 'HUMAN' },
        }),
      );
    });
    it('handles missing contactId gracefully', async () => {
      const result = await service.actionTransferToHuman(wsId, '', {
        reason: 'test',
      });
      expect(result.success).toBe(true);
    });
  });
  describe('actionSearchKnowledgeBase', () => {
    it('searches kloelMemory with workspace scope', async () => {
      const result = await service.actionSearchKnowledgeBase(wsId, {
        query: 'vendas',
      });
      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(prisma.kloelMemory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workspaceId: wsId }),
        }),
      );
    });
    it('scopes results to workspaceId', async () => {
      await service.actionSearchKnowledgeBase('ws-tenant', { query: 'x' });
      expect(prisma.kloelMemory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workspaceId: 'ws-tenant' }),
        }),
      );
    });
  });
  describe('actionTriggerFlow', () => {
    const phone = '5511999999999';
    it('finds flow by id and enqueues it', async () => {
      const result = await service.actionTriggerFlow(wsId, phone, {
        flowId: 'f-1',
      });
      expect(result.success).toBe(true);
      expect(result.triggered).toBe(true);
      expect(flowQueue.add).toHaveBeenCalledWith(
        'run-flow',
        expect.objectContaining({
          workspaceId: wsId,
          flowId: 'f-1',
          user: phone,
        }),
      );
    });
    it('finds flow by name when id is missing', async () => {
      const result = await service.actionTriggerFlow(wsId, phone, {
        flowName: 'Flow Test',
      });
      expect(result.success).toBe(true);
      expect(prisma.flow.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workspaceId: wsId }),
        }),
      );
    });
    it('returns error when flow not found', async () => {
      prisma.flow.findFirst.mockResolvedValue(null);
      const result = await service.actionTriggerFlow(wsId, phone, {
        flowName: 'No Exist',
      });
      expect(result.success).toBe(false);
    });
  });
  describe('actionLogEvent', () => {
    it('logs autopilot event', async () => {
      const result = await service.actionLogEvent(wsId, contactId, {
        event: 'page_viewed',
        properties: { url: '/pricing' },
      });
      expect(result.success).toBe(true);
      expect(result.event).toBe('page_viewed');
    });
    it('handles event creation failure silently in test env', async () => {
      prisma.autopilotEvent.create.mockRejectedValue(new Error('FK error'));
      const result = await service.actionLogEvent(wsId, contactId, {
        event: 'test_event',
      });
      expect(result.success).toBe(true);
    });
  });
  describe('actionConnectWhatsApp', () => {
    it('connects WhatsApp via provider registry', async () => {
      const result = await service.actionConnectWhatsApp(wsId, {});
      expect(result.success).toBe(true);
      expect(result.provider).toBe('meta-cloud');
      expect(providerRegistry.startSession).toHaveBeenCalledWith(wsId);
    });
    it('deduplicates when already connected', async () => {
      prisma.workspace.findUnique.mockResolvedValue({
        id: wsId,
        providerSettings: {
          whatsappProvider: 'meta-cloud',
          connectionStatus: 'connected',
        },
      });
      const result = await service.actionConnectWhatsApp(wsId, {});
      expect(result.deduplicated).toBe(true);
      expect(providerRegistry.startSession).not.toHaveBeenCalled();
    });
  });
  describe('actionImportContacts', () => {
    it('delegates to companion helper', async () => {
      const result = await service.actionImportContacts(wsId, {
        source: 'csv',
        csvData: 'phone\n5511999999999',
      });
      expect(result.success).toBe(true);
      expect(result.created).toBe(5);
    });
  });
  describe('tenant isolation', () => {
    it('actionUpdateLeadStatus scopes transaction to correct workspaceId', async () => {
      await service.actionUpdateLeadStatus('ws-isolated', contactId, {
        status: 'test',
      });
      expect(prisma.contact.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: contactId, workspaceId: 'ws-isolated' },
        }),
      );
    });
    it('actionSearchKnowledgeBase filters by correct workspaceId', async () => {
      await service.actionSearchKnowledgeBase('ws-isolated', { query: 'x' });
      expect(prisma.kloelMemory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workspaceId: 'ws-isolated' }),
        }),
      );
    });
    it('actionTriggerFlow scopes flow lookup to workspaceId', async () => {
      await service.actionTriggerFlow('ws-isolated', '5511999999999', {
        flowId: 'f-1',
      });
      expect(prisma.flow.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'f-1', workspaceId: 'ws-isolated' },
        }),
      );
    });
  });
  describe('error handling', () => {
    it('actionScheduleFollowup returns error on failure', async () => {
      prisma.followUp.create.mockRejectedValue(new Error('DB error'));
      const result = await service.actionScheduleFollowup(wsId, contactId, '5511999999999', {
        delayHours: 1,
      });
      expect(result.success).toBe(false);
    });
    it('actionTriggerFlow returns error on failure', async () => {
      prisma.flow.findFirst.mockRejectedValue(new Error('DB error'));
      const result = await service.actionTriggerFlow(wsId, '5511999999999', { flowId: 'f-1' });
      expect(result.success).toBe(false);
    });
    it('actionConnectWhatsApp returns error on failure', async () => {
      providerRegistry.startSession = jest.fn().mockRejectedValue(new Error('Meta API down'));
      const result = await service.actionConnectWhatsApp(wsId, {});

      expect(result.success).toBe(false);
    });
  });
});
