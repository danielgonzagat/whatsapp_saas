const mockFlowQueueAdd = jest.fn();

jest.mock('../queue/queue', () => ({
  flowQueue: { add: (...args: unknown[]) => mockFlowQueueAdd(...args) },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { correlationStore } from '../common/observability/correlation-store';
import { InboxGateway } from '../inbox/inbox.gateway';
import { OmnichannelService } from '../inbox/omnichannel.service';
import { PrismaService } from '../prisma/prisma.service';
import { WebhooksService } from './webhooks.service';

describe('WebhooksService', () => {
  let service: WebhooksService;
  let prisma: {
    message: {
      updateMany: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    auditLog: { create: jest.Mock };
    flow: { findFirst: jest.Mock };
    workspace: { findUnique: jest.Mock };
  };
  let gateway: {
    emitToWorkspace: jest.Mock;
  };
  let redis: {
    publish: jest.Mock;
    quit?: jest.Mock;
  };
  let moduleRef: TestingModule;
  let omnichannel: Record<string, never>;

  beforeEach(async () => {
    mockFlowQueueAdd.mockReset().mockResolvedValue({ id: 'job-1' });
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
    omnichannel = {};

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
    expect(gateway.emitToWorkspace).toHaveBeenCalledWith(
      'ws1',
      'message:status',
      expect.objectContaining({
        id: 'm1',
        status: 'DELIVERED',
      }),
    );
    expect(gateway.emitToWorkspace).toHaveBeenCalledWith(
      'ws1',
      'conversation:update',
      expect.objectContaining({
        id: 'c1',
        lastMessageStatus: 'DELIVERED',
        lastMessageId: 'm1',
      }),
    );
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

  it('propagates the request correlation id into generic webhook flow jobs', async () => {
    prisma.flow.findFirst.mockResolvedValue({ id: 'flow-1', workspaceId: 'ws1' });

    await correlationStore.run(
      { correlationId: 'corr-webhook-1', requestId: 'corr-webhook-1' },
      async () => {
        await service.processWebhook('ws1', 'flow-1', { phone: '+55 (11) 99999-0000' });
      },
    );

    expect(mockFlowQueueAdd).toHaveBeenCalledWith(
      'run-flow',
      expect.objectContaining({
        workspaceId: 'ws1',
        flowId: 'flow-1',
        user: '5511999990000',
        correlationId: 'corr-webhook-1',
        initialVars: expect.objectContaining({
          source: 'webhook',
          correlationId: 'corr-webhook-1',
        }),
      }),
    );
  });

  it('propagates the request correlation id into finance webhook flow jobs', async () => {
    prisma.workspace.findUnique.mockResolvedValue({
      providerSettings: { finance: { flowPaidId: 'flow-paid' } },
    });

    await correlationStore.run(
      { correlationId: 'corr-finance-1', requestId: 'corr-finance-1' },
      async () => {
        await service.processFinanceEvent('ws1', {
          status: 'paid',
          phone: '+55 (11) 98888-0000',
          amount: 199,
        });
      },
    );

    expect(mockFlowQueueAdd).toHaveBeenCalledWith(
      'run-flow',
      expect.objectContaining({
        workspaceId: 'ws1',
        flowId: 'flow-paid',
        user: '5511988880000',
        correlationId: 'corr-finance-1',
        initialVars: expect.objectContaining({
          source: 'finance_webhook',
          correlationId: 'corr-finance-1',
        }),
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ workspaceId: 'ws1', action: 'FINANCE_EVENT' }),
      }),
    );
  });
});
