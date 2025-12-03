import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappService } from './whatsapp.service';
import { WorkspaceService } from '../workspaces/workspace.service';
import { InboxService } from '../inbox/inbox.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { ConfigService } from '@nestjs/config';
import { NeuroCrmService } from '../crm/neuro-crm.service';
import { PrismaService } from '../prisma/prisma.service';

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
            config: ConfigService,
            neuroCrm: NeuroCrmService,
            prisma: PrismaService,
          ) =>
            new WhatsappService(
              workspaces as any,
              inbox as any,
              plan as any,
              {} as any,
              config as any,
              neuroCrm as any,
              prisma as any,
            ),
          inject: [
            WorkspaceService,
            InboxService,
            PlanLimitsService,
            ConfigService,
            NeuroCrmService,
            PrismaService,
          ],
        },
        { provide: WorkspaceService, useValue: {} },
        { provide: InboxService, useValue: {} },
        { provide: PlanLimitsService, useValue: {} },
        { provide: ConfigService, useValue: { get: () => undefined } },
        { provide: NeuroCrmService, useValue: {} },
        { provide: PrismaService, useValue: {} },
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
