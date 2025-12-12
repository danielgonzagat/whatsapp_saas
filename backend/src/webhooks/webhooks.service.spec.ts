import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksService } from './webhooks.service';
import { PrismaService } from '../prisma/prisma.service';
import { InboxGateway } from '../inbox/inbox.gateway';
import { OmnichannelService } from '../inbox/omnichannel.service';

describe('WebhooksService', () => {
  let service: WebhooksService;
  let prisma: any;
  let gateway: any;
  let redis: any;
  let moduleRef: TestingModule;
  let omnichannel: any;

  beforeEach(async () => {
    prisma = {
      message: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
      auditLog: { create: jest.fn() },
      flow: { findFirst: jest.fn() },
      workspace: { findUnique: jest.fn() },
    };
    gateway = { emitToWorkspace: jest.fn() };
    redis = { publish: jest.fn() };
    omnichannel = { };

    moduleRef = await Test.createTestingModule({
      providers: [
        WebhooksService,
        { provide: PrismaService, useValue: prisma },
        { provide: InboxGateway, useValue: gateway },
        { provide: 'IORedisModuleConnectionToken', useValue: redis },
        { provide: 'default_IORedisModuleConnectionToken', useValue: redis },
        { provide: OmnichannelService, useValue: omnichannel },
      ],
    }).compile();

    service = moduleRef.get<WebhooksService>(WebhooksService);
  });

  afterEach(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
    if (redis?.quit) {
      try {
        await redis.quit();
      } catch {
        /* ignore */
      }
    }
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('updates by externalId and emits', async () => {
    prisma.message.updateMany.mockResolvedValue({ count: 1 });
    prisma.message.findMany.mockResolvedValue([
      { id: 'm1', conversationId: 'c1', contactId: 'ct1', externalId: 'ext1' },
    ]);

    const res = await service.updateMessageStatus({
      workspaceId: 'ws1',
      externalId: 'ext1',
      status: 'DELIVERED',
    });

    expect(res.updated).toBe(1);
    expect(gateway.emitToWorkspace).toHaveBeenCalledWith('ws1', 'message:status', expect.objectContaining({
      id: 'm1',
      status: 'DELIVERED',
    }));
    expect(gateway.emitToWorkspace).toHaveBeenCalledWith('ws1', 'conversation:update', expect.objectContaining({
      id: 'c1',
      lastMessageStatus: 'DELIVERED',
      lastMessageId: 'm1',
    }));
  });

  it('falls back to phone when no externalId', async () => {
    prisma.message.findFirst.mockResolvedValue({
      id: 'm2',
      conversationId: 'c2',
      contactId: 'ct2',
      externalId: null,
    });
    prisma.message.update.mockResolvedValue({
      id: 'm2',
      conversationId: 'c2',
      contactId: 'ct2',
      externalId: null,
    });

    const res = await service.updateMessageStatus({
      workspaceId: 'ws1',
      status: 'READ',
      phone: '+55 (11) 99999-9999',
      channel: 'EMAIL',
    });

    expect(res.updated).toBe(1);
    expect(gateway.emitToWorkspace).toHaveBeenCalled();
    expect(redis.publish).toHaveBeenCalled();
  });

  it('logs miss when nothing is updated', async () => {
    const res = await service.updateMessageStatus({
      workspaceId: 'ws1',
      status: 'FAILED',
      externalId: 'unknown',
    });
    expect(res.updated).toBe(0);
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });
});
