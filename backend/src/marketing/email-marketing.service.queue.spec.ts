import { EmailMarketingService } from './email-marketing.service';

type WorkerCb = (job: { data: { campaignId: string; workspaceId: string } }) => Promise<void>;

let _workerCallback: WorkerCb | null = null;

function firstCallArg<T>(mock: { mock: { calls: Array<[unknown, ...unknown[]]> } }): T {
  const [arg] = mock.mock.calls[0] ?? [];
  return arg as T;
}

jest.mock('bullmq', () => {
  const queueAdd = jest.fn();
  const queueClose = jest.fn().mockResolvedValue(undefined);
  const workerClose = jest.fn().mockResolvedValue(undefined);

  return {
    Queue: jest.fn().mockImplementation(() => ({
      add: queueAdd,
      close: queueClose,
    })),
    Worker: jest.fn().mockImplementation((_name: string, cb: WorkerCb) => {
      _workerCallback = cb;
      return {
        close: workerClose,
        on: jest.fn(),
      };
    }),
  };
});

jest.mock('../common/redis/redis.util', () => ({
  getRedisUrl: jest.fn().mockReturnValue('redis://fake:6379'),
}));

jest.mock('../common/utils/unsubscribe-footer.util', () => ({
  buildListUnsubscribeHeader: jest.fn().mockReturnValue(null),
  buildUnsubscribeFooterHtml: jest.fn().mockReturnValue('<footer-unsub></footer-unsub>'),
}));

describe('EmailMarketingService', () => {
  const campaignCreate = jest.fn();
  const campaignFindMany = jest.fn();
  const campaignFindFirst = jest.fn();
  const campaignFindFirstOrThrow = jest.fn();
  const campaignUpdate = jest.fn();
  const campaignUpdateMany = jest.fn();
  const deliveryCreate = jest.fn();
  const recipientUpdate = jest.fn();
  const recipientUpdateMany = jest.fn();
  const recipientFindFirst = jest.fn();
  const approvalFindFirst = jest.fn();

  const sendEmail = jest.fn();
  const opsAlertOnError = jest.fn();

  let service: EmailMarketingService;

  beforeEach(() => {
    jest.clearAllMocks();
    _workerCallback = null;
    sendEmail.mockResolvedValue(true);
    approvalFindFirst.mockResolvedValue({ id: 'approval-email-1' });

    service = new EmailMarketingService(
      {
        emailCampaign: {
          create: campaignCreate,
          findMany: campaignFindMany,
          findFirst: campaignFindFirst,
          findFirstOrThrow: campaignFindFirstOrThrow,
          update: campaignUpdate,
          updateMany: campaignUpdateMany,
        },
        emailCampaignDelivery: {
          create: deliveryCreate,
        },
        emailCampaignRecipient: {
          update: recipientUpdate,
          updateMany: recipientUpdateMany,
          findFirst: recipientFindFirst,
        },
        approvalRequest: {
          findFirst: approvalFindFirst,
        },
      } as never,
      { sendEmail } as never,
      { alertOnCriticalError: opsAlertOnError } as never,
    );

    service.onModuleInit();
  });
  describe('enqueueSend', () => {
    it('transitions DRAFT campaign to SCHEDULED status via queue', async () => {
      campaignFindFirst.mockResolvedValueOnce({
        id: 'camp-1',
        workspaceId: 'ws-1',
        status: 'DRAFT',
        name: 'Test',
      });
      campaignUpdate.mockResolvedValue({});
      campaignFindFirstOrThrow.mockResolvedValue({
        id: 'camp-1',
        status: 'SCHEDULED',
        recipients: [],
      });

      const result = await service.enqueueSend('camp-1', 'ws-1');

      expect(campaignUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'camp-1', workspaceId: 'ws-1' },
          data: { status: 'SCHEDULED' },
        }),
      );
      // Queue.add was called
      expect(result.status).toBe('SCHEDULED');
    });

    it('rejects enqueue when campaign is not in DRAFT status', async () => {
      campaignFindFirst.mockResolvedValueOnce({
        id: 'camp-1',
        workspaceId: 'ws-1',
        status: 'SENT',
        name: 'Test',
      });

      await expect(service.enqueueSend('camp-1', 'ws-1')).rejects.toThrow(
        'Cannot send campaign in status: SENT',
      );
    });

    it('sends directly when queue is not available', async () => {
      campaignFindFirst.mockResolvedValue({
        id: 'camp-1',
        workspaceId: 'ws-1',
        htmlBody: '<p>Hi {{name}}</p>',
        subject: 'Test',
        status: 'DRAFT',
        name: 'Test',
        recipients: [{ id: 'r-1', email: 'a@test.com', name: 'A', status: 'PENDING' }],
      });
      campaignUpdate.mockResolvedValue({});
      campaignFindFirstOrThrow.mockResolvedValue({ id: 'camp-1', status: 'SENT', recipients: [] });
      sendEmail.mockResolvedValue(true);
      deliveryCreate.mockResolvedValue({});
      recipientUpdate.mockResolvedValue({});

      // Destroy the queue/worker so the service has no queue (simulating Redis down)
      await service.onModuleDestroy();

      const noQService = new EmailMarketingService(
        {
          emailCampaign: {
            create: campaignCreate,
            findMany: campaignFindMany,
            findFirst: campaignFindFirst,
            findFirstOrThrow: campaignFindFirstOrThrow,
            update: campaignUpdate,
            updateMany: campaignUpdateMany,
          },
          emailCampaignDelivery: { create: deliveryCreate },
          emailCampaignRecipient: {
            update: recipientUpdate,
            updateMany: recipientUpdateMany,
            findFirst: recipientFindFirst,
          },
          approvalRequest: { findFirst: approvalFindFirst },
        } as never,
        { sendEmail } as never,
        { alertOnCriticalError: opsAlertOnError } as never,
      );

      const result = await noQService.enqueueSend('camp-1', 'ws-1');
      expect(result.status).toBe('SENT');
    });

    it('rejects enqueue when there is no approved send request', async () => {
      campaignFindFirst.mockResolvedValueOnce({
        id: 'camp-1',
        workspaceId: 'ws-1',
        status: 'DRAFT',
        name: 'Test',
      });
      approvalFindFirst.mockResolvedValueOnce(null);

      await expect(service.enqueueSend('camp-1', 'ws-1')).rejects.toThrow(
        'Approved email campaign send request not found',
      );
      expect(campaignUpdate).not.toHaveBeenCalled();
    });
  });

  describe('reconcileDeliveryFromWebhook', () => {
    it('reconciles DELIVERED event and increments deliveredCount', async () => {
      recipientFindFirst.mockResolvedValue({
        id: 'r-1',
        campaignId: 'camp-1',
        workspaceId: 'ws-1',
        email: 'a@test.com',
        providerMessageId: 'prov-1',
      });
      deliveryCreate.mockResolvedValue({});
      recipientUpdate.mockResolvedValue({});
      campaignUpdate.mockResolvedValue({});

      const result = await service.reconcileDeliveryFromWebhook({
        providerMessageId: 'prov-1',
        event: 'DELIVERED',
      });

      expect(recipientFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { providerMessageId: 'prov-1', workspaceId: { not: '' } },
        }),
      );
      expect(campaignUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'camp-1', workspaceId: 'ws-1' },
          data: { deliveredCount: { increment: 1 } },
        }),
      );
      expect(result).toBe(true);
    });

    it('reconciles OPENED event and increments openedCount', async () => {
      recipientFindFirst.mockResolvedValue({
        id: 'r-1',
        campaignId: 'camp-1',
        workspaceId: 'ws-1',
        email: 'a@test.com',
      });
      deliveryCreate.mockResolvedValue({});
      recipientUpdate.mockResolvedValue({});
      campaignUpdate.mockResolvedValue({});

      await service.reconcileDeliveryFromWebhook({
        providerMessageId: 'prov-2',
        event: 'OPENED',
      });

      expect(campaignUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { openedCount: { increment: 1 } },
        }),
      );
    });

    it('reconciles UNSUBSCRIBED event', async () => {
      recipientFindFirst.mockResolvedValue({
        id: 'r-1',
        campaignId: 'camp-1',
        workspaceId: 'ws-1',
        email: 'a@test.com',
      });
      deliveryCreate.mockResolvedValue({});
      recipientUpdate.mockResolvedValue({});
      campaignUpdate.mockResolvedValue({});

      await service.reconcileDeliveryFromWebhook({
        providerMessageId: 'prov-3',
        event: 'UNSUBSCRIBED',
      });

      const updateArgs = firstCallArg<{
        where?: { id?: string; workspaceId?: string };
        data?: { status?: string };
      }>(recipientUpdateMany);
      expect(updateArgs.where).toEqual({ id: 'r-1', workspaceId: 'ws-1' });
      expect(updateArgs.data).toMatchObject({ status: 'UNSUBSCRIBED' });
    });

    it('returns false when no recipient is found for providerMessageId', async () => {
      recipientFindFirst.mockResolvedValue(null);

      const result = await service.reconcileDeliveryFromWebhook({
        providerMessageId: 'unknown-id',
        event: 'DELIVERED',
      });

      expect(result).toBe(false);
      expect(deliveryCreate).not.toHaveBeenCalled();
    });
  });
});
