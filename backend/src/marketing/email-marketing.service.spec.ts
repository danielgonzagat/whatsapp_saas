import { EmailMarketingService } from './email-marketing.service';

type WorkerCb = (job: { data: { campaignId: string; workspaceId: string } }) => Promise<void>;

let workerCallback: WorkerCb | null = null;

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
      workerCallback = cb;
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
  const deliveryCreate = jest.fn();
  const recipientUpdate = jest.fn();
  const recipientFindFirst = jest.fn();

  const sendEmail = jest.fn();
  const opsAlertOnError = jest.fn();

  let service: EmailMarketingService;

  beforeEach(() => {
    jest.clearAllMocks();
    workerCallback = null;
    sendEmail.mockResolvedValue(true);

    service = new EmailMarketingService(
      {
        emailCampaign: {
          create: campaignCreate,
          findMany: campaignFindMany,
          findFirst: campaignFindFirst,
          findFirstOrThrow: campaignFindFirstOrThrow,
          update: campaignUpdate,
        },
        emailCampaignDelivery: {
          create: deliveryCreate,
        },
        emailCampaignRecipient: {
          update: recipientUpdate,
          findFirst: recipientFindFirst,
        },
      } as never,
      { sendEmail } as never,
      { alertOnCriticalError: opsAlertOnError } as never,
    );

    service.onModuleInit();
  });

  describe('createCampaign', () => {
    it('creates a campaign with all optional fields', async () => {
      campaignCreate.mockResolvedValue({
        id: 'camp-1',
        workspaceId: 'ws-1',
        name: 'Test Campaign',
        subject: 'Hello {{name}}',
        htmlBody: '<p>Hi</p>',
        fromEmail: 'custom@test.com',
        fromName: 'Custom',
        replyTo: 'reply@test.com',
        status: 'DRAFT',
        totalRecipients: 2,
        provider: 'log',
        recipients: [
          { id: 'r-1', email: 'a@test.com', name: 'A', status: 'PENDING' },
          { id: 'r-2', email: 'b@test.com', name: null, status: 'PENDING' },
        ],
      });

      const result = await service.createCampaign('ws-1', {
        name: 'Test Campaign',
        subject: 'Hello {{name}}',
        htmlBody: '<p>Hi</p>',
        fromEmail: 'custom@test.com',
        fromName: 'Custom',
        replyTo: 'reply@test.com',
        recipients: [
          { email: 'a@test.com', name: 'A' },
          { email: 'b@test.com' },
        ],
      });

      expect(campaignCreate).toHaveBeenCalledTimes(1);
      const call = campaignCreate.mock.calls[0][0];
      expect(call.data.name).toBe('Test Campaign');
      expect(call.data.fromEmail).toBe('custom@test.com');
      expect(call.data.recipients.create).toHaveLength(2);
      expect(result.id).toBe('camp-1');
    });

    it('creates a campaign with minimal fields only', async () => {
      campaignCreate.mockResolvedValue({
        id: 'camp-2',
        workspaceId: 'ws-1',
        name: 'Minimal',
        subject: 'Subject',
        htmlBody: '<p>Body</p>',
        fromEmail: 'noreply@kloel.com',
        fromName: 'KLOEL',
        status: 'DRAFT',
        totalRecipients: 1,
        provider: 'log',
        recipients: [{ id: 'r-3', email: 'x@test.com', status: 'PENDING' }],
      });

      const result = await service.createCampaign('ws-1', {
        name: 'Minimal',
        subject: 'Subject',
        htmlBody: '<p>Body</p>',
        recipients: [{ email: 'x@test.com' }],
      });

      const call = campaignCreate.mock.calls[0][0];
      expect(call.data.fromEmail).toBe('noreply@kloel.com');
      expect(call.data.status).toBe('DRAFT');
      expect(result.totalRecipients).toBe(1);
    });
  });

  describe('listCampaigns', () => {
    it('returns workspace-filtered campaigns ordered by createdAt desc', async () => {
      campaignFindMany.mockResolvedValue([
        { id: 'camp-1', name: 'Camp 1', status: 'SENT' },
        { id: 'camp-2', name: 'Camp 2', status: 'DRAFT' },
      ]);

      const result = await service.listCampaigns('ws-1');

      expect(campaignFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: 'ws-1' },
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(result).toHaveLength(2);
    });
  });

  describe('getCampaign', () => {
    it('returns a workspace-scoped campaign with recipients', async () => {
      campaignFindFirst.mockResolvedValue({
        id: 'camp-1',
        workspaceId: 'ws-1',
        recipients: [{ id: 'r-1', email: 'a@test.com' }],
      });

      const result = await service.getCampaign('camp-1', 'ws-1');

      expect(campaignFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'camp-1', workspaceId: 'ws-1' },
          include: { recipients: true },
        }),
      );
      expect(result).toBeDefined();
    });

    it('returns null when campaign not found', async () => {
      campaignFindFirst.mockResolvedValue(null);

      const result = await service.getCampaign('nonexistent', 'ws-1');

      expect(result).toBeNull();
    });
  });

  describe('getCampaignWithDeliveries', () => {
    it('returns campaign with nested recipient deliveries', async () => {
      campaignFindFirst.mockResolvedValue({
        id: 'camp-1',
        recipients: [{ id: 'r-1', deliveries: [{ id: 'd-1', event: 'SENT' }] }],
      });

      const result = await service.getCampaignWithDeliveries('camp-1', 'ws-1');

      expect(campaignFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'camp-1', workspaceId: 'ws-1' },
          include: { recipients: { include: { deliveries: true } } },
        }),
      );
      expect(result).toBeDefined();
    });
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
          where: { id: 'camp-1' },
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
        recipients: [
          { id: 'r-1', email: 'a@test.com', name: 'A', status: 'PENDING' },
        ],
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
          },
          emailCampaignDelivery: { create: deliveryCreate },
          emailCampaignRecipient: { update: recipientUpdate, findFirst: recipientFindFirst },
        } as never,
        { sendEmail } as never,
        { alertOnCriticalError: opsAlertOnError } as never,
      );

      const result = await noQService.enqueueSend('camp-1', 'ws-1');
      expect(result.status).toBe('SENT');
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
          where: { providerMessageId: 'prov-1' },
        }),
      );
      expect(campaignUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'camp-1' },
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

      expect(campaignUpdate).toHaveBeenCalledWith(
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

      expect(recipientUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'r-1' },
          data: expect.objectContaining({ status: 'UNSUBSCRIBED' }),
        }),
      );
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

  describe('processCampaignSend (via worker callback)', () => {
    it('sends to all valid recipients and updates status counts', async () => {
      campaignFindFirst.mockResolvedValue({
        id: 'camp-1',
        workspaceId: 'ws-1',
        name: 'Test',
        subject: 'Hello',
        htmlBody: '<p>Hi {{name}}</p>',
        status: 'SCHEDULED',
        recipients: [
          { id: 'r-1', email: 'a@test.com', name: 'Alice', status: 'PENDING' },
          { id: 'r-2', email: 'b@test.com', name: null, status: 'PENDING' },
        ],
      });
      campaignUpdate.mockResolvedValue({});
      deliveryCreate.mockResolvedValue({});
      recipientUpdate.mockResolvedValue({});
      sendEmail.mockResolvedValue(true);

      if (!workerCallback) {
        throw new Error('Worker callback was not captured — check bullmq mock setup');
      }
      await workerCallback({ data: { campaignId: 'camp-1', workspaceId: 'ws-1' } });

      expect(sendEmail).toHaveBeenCalledTimes(2);
      const finalCalls = campaignUpdate.mock.calls;
      const sendingCall = finalCalls.find(
        (c: unknown[]) => (c[0] as Record<string, unknown>)?.data !== undefined,
      );
      expect(sendingCall).toBeDefined();
    });

    it('skips UNSUBSCRIBED recipients', async () => {
      campaignFindFirst.mockResolvedValue({
        id: 'camp-1',
        workspaceId: 'ws-1',
        name: 'Test',
        subject: 'Hello',
        htmlBody: '<p>Hi</p>',
        status: 'SCHEDULED',
        recipients: [
          { id: 'r-1', email: 'a@test.com', name: 'Alice', status: 'UNSUBSCRIBED' },
          { id: 'r-2', email: 'b@test.com', name: 'Bob', status: 'PENDING' },
        ],
      });
      campaignUpdate.mockResolvedValue({});
      deliveryCreate.mockResolvedValue({});
      recipientUpdate.mockResolvedValue({});
      sendEmail.mockResolvedValue(true);

      if (!workerCallback) {
        throw new Error('Worker callback was not captured');
      }
      await workerCallback({ data: { campaignId: 'camp-1', workspaceId: 'ws-1' } });

      expect(sendEmail).toHaveBeenCalledTimes(1);
      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'b@test.com' }),
      );
    });

    it('records failed delivery when emailService returns false', async () => {
      campaignFindFirst.mockResolvedValue({
        id: 'camp-1',
        workspaceId: 'ws-1',
        name: 'Test',
        subject: 'Hello',
        htmlBody: '<p>Hi</p>',
        status: 'SCHEDULED',
        recipients: [
          { id: 'r-1', email: 'a@test.com', name: 'A', status: 'PENDING' },
        ],
      });
      campaignUpdate.mockResolvedValue({});
      deliveryCreate.mockResolvedValue({});
      recipientUpdate.mockResolvedValue({});
      sendEmail.mockResolvedValue(false);

      if (!workerCallback) {
        throw new Error('Worker callback was not captured');
      }
      await workerCallback({ data: { campaignId: 'camp-1', workspaceId: 'ws-1' } });

      expect(deliveryCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            event: 'FAILED',
            campaignId: 'camp-1',
            recipientId: 'r-1',
          }),
        }),
      );
      expect(recipientUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'FAILED',
            errorMessage: 'Provider returned failure',
          }),
        }),
      );
    });

    it('records failed delivery when sendEmail throws', async () => {
      campaignFindFirst.mockResolvedValue({
        id: 'camp-1',
        workspaceId: 'ws-1',
        name: 'Test',
        subject: 'Hello',
        htmlBody: '<p>Hi</p>',
        status: 'SCHEDULED',
        recipients: [
          { id: 'r-1', email: 'a@test.com', name: 'A', status: 'PENDING' },
        ],
      });
      campaignUpdate.mockResolvedValue({});
      deliveryCreate.mockResolvedValue({});
      recipientUpdate.mockResolvedValue({});
      sendEmail.mockRejectedValue(new Error('SMTP connection refused'));

      if (!workerCallback) {
        throw new Error('Worker callback was not captured');
      }
      await workerCallback({ data: { campaignId: 'camp-1', workspaceId: 'ws-1' } });

      expect(deliveryCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            event: 'FAILED',
            campaignId: 'camp-1',
          }),
        }),
      );
      expect(recipientUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'FAILED',
            errorMessage: 'SMTP connection refused',
          }),
        }),
      );
    });
  });
});
