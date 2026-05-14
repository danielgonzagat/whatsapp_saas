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
        recipients: [{ email: 'a@test.com', name: 'A' }, { email: 'b@test.com' }],
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
      expect(result).toMatchObject({
        id: 'camp-1',
        workspaceId: 'ws-1',
        recipients: [{ id: 'r-1', email: 'a@test.com' }],
      });
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
      expect(result).toMatchObject({
        id: 'camp-1',
        recipients: [{ id: 'r-1', deliveries: [{ id: 'd-1', event: 'SENT' }] }],
      });
    });
  });
});
