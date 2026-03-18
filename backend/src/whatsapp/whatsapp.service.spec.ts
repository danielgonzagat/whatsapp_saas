import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappService } from './whatsapp.service';
import { WorkspaceService } from '../workspaces/workspace.service';
import { InboxService } from '../inbox/inbox.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { NeuroCrmService } from '../crm/neuro-crm.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppProviderRegistry } from './providers/provider-registry';
import { WhatsAppApiProvider } from './providers/whatsapp-api.provider';

describe('WhatsappService', () => {
  let service: WhatsappService;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        {
          provide: WhatsappService,
          useFactory: (
            workspaces: WorkspaceService,
            inbox: InboxService,
            plan: PlanLimitsService,
            neuroCrm: NeuroCrmService,
            prisma: PrismaService,
            providerRegistry: WhatsAppProviderRegistry,
            whatsappApi: WhatsAppApiProvider,
          ) =>
            new WhatsappService(
              workspaces as any,
              inbox as any,
              plan as any,
              {} as any,
              neuroCrm as any,
              prisma as any,
              providerRegistry as any,
              whatsappApi as any,
            ),
          inject: [
            WorkspaceService,
            InboxService,
            PlanLimitsService,
            NeuroCrmService,
            PrismaService,
            WhatsAppProviderRegistry,
            WhatsAppApiProvider,
          ],
        },
        { provide: WorkspaceService, useValue: {} },
        { provide: InboxService, useValue: {} },
        { provide: PlanLimitsService, useValue: {} },
        { provide: NeuroCrmService, useValue: {} },
        { provide: PrismaService, useValue: {} },
        { provide: WhatsAppProviderRegistry, useValue: {} },
        { provide: WhatsAppApiProvider, useValue: {} },
        { provide: 'IORedisModuleConnectionToken', useValue: {} },
      ],
    }).compile();

    service = module.get<WhatsappService>(WhatsappService);
  });

  afterAll(async () => {
    await module?.close();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
