import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappService } from './whatsapp.service';
import { WorkspaceService } from '../workspaces/workspace.service';
import { InboxService } from '../inbox/inbox.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { NeuroCrmService } from '../crm/neuro-crm.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppProviderRegistry } from './providers/provider-registry';
import { WhatsAppApiProvider } from './providers/whatsapp-api.provider';

jest.mock('../queue/queue', () => ({
  autopilotQueue: { add: jest.fn() },
  flowQueue: { add: jest.fn() },
}));

describe('WhatsappService', () => {
  let service: WhatsappService;
  let module: TestingModule;
  let mockAutopilotAdd: jest.Mock;
  let mockFlowAdd: jest.Mock;
  let workspaceService: { getWorkspace: jest.Mock };
  let inboxService: { saveMessageByPhone: jest.Mock };
  let redis: {
    get: jest.Mock;
    setex: jest.Mock;
    set: jest.Mock;
    publish: jest.Mock;
    rpush: jest.Mock;
    expire: jest.Mock;
  };
  let neuroCrm: { analyzeContact: jest.Mock };

  beforeEach(async () => {
    const queueModule = jest.requireMock('../queue/queue');
    mockAutopilotAdd = queueModule.autopilotQueue.add;
    mockFlowAdd = queueModule.flowQueue.add;

    workspaceService = {
      getWorkspace: jest.fn().mockResolvedValue({
        id: 'ws-1',
        providerSettings: {
          autopilot: { enabled: false },
          whatsappApiSession: { status: 'connected' },
        },
      }),
    };
    inboxService = {
      saveMessageByPhone: jest.fn().mockResolvedValue({
        id: 'msg-1',
        contactId: 'contact-1',
      }),
    };
    redis = {
      get: jest.fn().mockResolvedValue(null),
      setex: jest.fn().mockResolvedValue('OK'),
      set: jest.fn().mockResolvedValue('OK'),
      publish: jest.fn().mockResolvedValue(1),
      rpush: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
    };
    neuroCrm = {
      analyzeContact: jest.fn().mockResolvedValue(undefined),
    };
    mockAutopilotAdd.mockResolvedValue(undefined);
    mockFlowAdd.mockResolvedValue(undefined);

    module = await Test.createTestingModule({
      providers: [
        {
          provide: WhatsappService,
          useFactory: (
            workspaces: WorkspaceService,
            inbox: InboxService,
            plan: PlanLimitsService,
            prisma: PrismaService,
            providerRegistry: WhatsAppProviderRegistry,
            whatsappApi: WhatsAppApiProvider,
          ) =>
            new WhatsappService(
              workspaces as any,
              inbox as any,
              plan as any,
              redis as any,
              neuroCrm as any,
              prisma as any,
              providerRegistry as any,
              whatsappApi as any,
            ),
          inject: [
            WorkspaceService,
            InboxService,
            PlanLimitsService,
            PrismaService,
            WhatsAppProviderRegistry,
            WhatsAppApiProvider,
          ],
        },
        { provide: WorkspaceService, useValue: workspaceService },
        { provide: InboxService, useValue: inboxService },
        { provide: PlanLimitsService, useValue: {} },
        { provide: NeuroCrmService, useValue: neuroCrm },
        { provide: PrismaService, useValue: { autopilotEvent: { findFirst: jest.fn().mockResolvedValue(null) } } },
        { provide: WhatsAppProviderRegistry, useValue: {} },
        { provide: WhatsAppApiProvider, useValue: {} },
        { provide: 'IORedisModuleConnectionToken', useValue: redis },
      ],
    }).compile();

    service = module.get<WhatsappService>(WhatsappService);
  });

  afterEach(async () => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await module?.close();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('queues consolidated scan-contact when WAHA session is connected even with autopilot disabled', async () => {
    await service.handleIncoming('ws-1', '5511999999999', 'Quero saber sobre PDRN');

    expect(mockAutopilotAdd).toHaveBeenCalledWith(
      'scan-contact',
      expect.objectContaining({
        workspaceId: 'ws-1',
        contactId: 'contact-1',
        phone: '5511999999999',
        messageContent: 'Quero saber sobre PDRN',
        messageId: 'msg-1',
      }),
      expect.objectContaining({
        jobId: 'scan-contact:ws-1:contact-1',
        removeOnComplete: true,
      }),
    );
  });
});
