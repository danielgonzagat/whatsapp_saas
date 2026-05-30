import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockFlowQueueAdd = jest.fn<(...args: unknown[]) => Promise<{ id: string }>>();

jest.mock('../queue/queue', () => ({
  flowQueue: { add: (...args: unknown[]) => mockFlowQueueAdd(...args) },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { correlationStore } from '../common/observability/correlation-store';
import { InboxGateway } from '../inbox/inbox.gateway';
import { OmnichannelService } from '../inbox/omnichannel.service';
import { PrismaService } from '../prisma/prisma.service';
import { WebhooksService } from './webhooks.service';
import { createPartialPrismaMock } from '../../test/helpers/prisma.mock';

describe('WebhooksService', () => {
  let service: WebhooksService;
  let prisma: ReturnType<typeof createPartialPrismaMock>;
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
    prisma = createPartialPrismaMock({
      message: ['updateMany', 'findMany', 'findFirst', 'update'],
      auditLog: ['create'],
      flow: ['findFirst'],
      workspace: ['findUnique'],
    });
    prisma.message.updateMany.mockResolvedValue({ count: 0 });
    prisma.message.findMany.mockResolvedValue([]);
    prisma.message.findFirst.mockResolvedValue(null);
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

  describe('logWebhookEvent claim-once idempotency', () => {
    function buildService(
      webhookEvent: Partial<Record<'upsert' | 'updateMany' | 'findUnique', jest.Mock>>,
    ) {
      const localPrisma = createPartialPrismaMock({
        webhookEvent: ['upsert', 'updateMany', 'findUnique'],
      });
      if (webhookEvent.upsert) localPrisma.webhookEvent.upsert = webhookEvent.upsert;
      if (webhookEvent.updateMany) localPrisma.webhookEvent.updateMany = webhookEvent.updateMany;
      if (webhookEvent.findUnique) localPrisma.webhookEvent.findUnique = webhookEvent.findUnique;
      const localService = new WebhooksService(
        localPrisma as unknown as PrismaService,
        { emitToWorkspace: jest.fn() } as unknown as InboxGateway,
        { publish: jest.fn() } as unknown as never,
        {} as unknown as OmnichannelService,
      );
      return { localService, localPrisma };
    }

    it('claims a fresh event by flipping received -> processing and reports received', async () => {
      const upsert = jest.fn<() => Promise<unknown>>().mockResolvedValue({
        id: 'evt-1',
        provider: 'stripe',
        externalId: 'pi_fresh',
        status: 'received',
      });
      const updateMany = jest.fn<() => Promise<unknown>>().mockResolvedValue({ count: 1 });
      const findUnique = jest.fn<() => Promise<unknown>>();
      const { localService, localPrisma } = buildService({ upsert, updateMany, findUnique });

      const result = await localService.logWebhookEvent('stripe', 'payment_intent.succeeded', 'pi_fresh', {
        id: 'pi_fresh',
      });

      // The atomic claim must run, gated on the still-`received` row.
      expect(localPrisma.webhookEvent.updateMany).toHaveBeenCalledWith({
        where: { provider: 'stripe', externalId: 'pi_fresh', status: 'received' },
        data: { status: 'processing' },
      });
      // Caller is told `received` so it runs the handler chain exactly once.
      expect(result.status).toBe('received');
      // The upsert must NOT downgrade an existing status — only refresh receivedAt.
      const upsertArg = upsert.mock.calls[0]?.[0] as { update?: { status?: string } };
      expect(upsertArg.update?.status).toBeUndefined();
    });

    it('is a no-op replay: a previously processed event is returned as processed and never re-claimed', async () => {
      const upsert = jest.fn<() => Promise<unknown>>().mockResolvedValue({
        id: 'evt-2',
        provider: 'stripe',
        externalId: 'pi_done',
        status: 'processed',
      });
      const updateMany = jest.fn<() => Promise<unknown>>().mockResolvedValue({ count: 0 });
      const { localService, localPrisma } = buildService({ upsert, updateMany });

      const result = await localService.logWebhookEvent('stripe', 'payment_intent.succeeded', 'pi_done', {
        id: 'pi_done',
      });

      // Post-TTL Stripe redelivery: the row is already `processed`. We must
      // hand that status back so the controller short-circuits, and must NOT
      // attempt to re-claim (which would re-arm double money processing).
      expect(result.status).toBe('processed');
      expect(localPrisma.webhookEvent.updateMany).not.toHaveBeenCalled();
    });

    it('loses a concurrent claim race and returns the freshest row instead of re-processing', async () => {
      const upsert = jest.fn<() => Promise<unknown>>().mockResolvedValue({
        id: 'evt-3',
        provider: 'stripe',
        externalId: 'pi_race',
        status: 'received',
      });
      // Another concurrent delivery already flipped received -> processing.
      const updateMany = jest.fn<() => Promise<unknown>>().mockResolvedValue({ count: 0 });
      const findUnique = jest.fn<() => Promise<unknown>>().mockResolvedValue({
        id: 'evt-3',
        provider: 'stripe',
        externalId: 'pi_race',
        status: 'processing',
      });
      const { localService } = buildService({ upsert, updateMany, findUnique });

      const result = await localService.logWebhookEvent('stripe', 'payment_intent.succeeded', 'pi_race', {
        id: 'pi_race',
      });

      // The loser must surface the live status (`processing`), not `received`,
      // so the caller does not run the handler chain a second time.
      expect(findUnique).toHaveBeenCalled();
      expect(result.status).toBe('processing');
    });
  });

});
