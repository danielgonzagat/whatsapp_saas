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
  const approvalFindFirst = jest.fn();

  const sendEmail = jest.fn();
  const opsAlertOnError = jest.fn();

  let service: EmailMarketingService;

  beforeEach(() => {
    jest.clearAllMocks();
    workerCallback = null;
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
        },
        emailCampaignDelivery: {
          create: deliveryCreate,
        },
        emailCampaignRecipient: {
          update: recipientUpdate,
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
      expect(sendingCall?.[0]).toEqual(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'SENDING' }),
        }),
      );
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
      expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'b@test.com' }));
    });

    it('records failed delivery when emailService returns false', async () => {
      campaignFindFirst.mockResolvedValue({
        id: 'camp-1',
        workspaceId: 'ws-1',
        name: 'Test',
        subject: 'Hello',
        htmlBody: '<p>Hi</p>',
        status: 'SCHEDULED',
        recipients: [{ id: 'r-1', email: 'a@test.com', name: 'A', status: 'PENDING' }],
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
        recipients: [{ id: 'r-1', email: 'a@test.com', name: 'A', status: 'PENDING' }],
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

  describe('unsubscribe footer presence', () => {
    it('appends unsubscribe footer HTML to campaign emails', async () => {
      campaignFindFirst.mockResolvedValue({
        id: 'camp-1',
        workspaceId: 'ws-1',
        name: 'Test',
        subject: 'Hello',
        htmlBody: '<p>Hi</p>',
        status: 'SCHEDULED',
        recipients: [{ id: 'r-1', email: 'a@test.com', name: 'Alice', status: 'PENDING' }],
      });
      campaignUpdate.mockResolvedValue({});
      deliveryCreate.mockResolvedValue({});
      recipientUpdate.mockResolvedValue({});
      sendEmail.mockResolvedValue(true);

      if (!workerCallback) {
        throw new Error('Worker callback was not captured');
      }
      await workerCallback({ data: { campaignId: 'camp-1', workspaceId: 'ws-1' } });

      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('footer-unsub'),
        }),
      );
    });
  });
});
