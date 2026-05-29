import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { EmailService } from '../auth/email.service';
import { PrismaService } from '../prisma/prisma.service';

import { EmailMarketingService } from './email-marketing.service';

/**
 * Integration-style flow spec for {@link EmailMarketingService.enqueueSend}
 * and its downstream `processCampaignSend` worker body.
 *
 * Production contract (see CLAUDE.md "REGRA DE QUALIDADE DE IA" +
 * "REGRA DE INTEGRACOES EXTERNAS" + "REGRA DE OBSERVABILIDADE"):
 *  - workspaceId isolation: campaign lookup, recipient updates, delivery
 *    rows and stat updates all filter/scope by workspaceId;
 *  - approval gate: a `email_campaign:send` ApprovalRequest in state
 *    APPROVED|COMPLETED is required before the campaign moves out of DRAFT;
 *  - status lifecycle: DRAFT -> SCHEDULED -> SENDING -> SENT with
 *    `sentCount`/`failedCount` tracked per delivery;
 *  - per-recipient resilience: provider failure for one recipient must
 *    NOT abort the rest; both SENT and FAILED events are recorded;
 *  - unsubscribed recipients are skipped (no SENT, no FAILED row);
 *  - tracking: every send (success or failure) writes one
 *    EmailCampaignDelivery row plus one EmailCampaignRecipient update.
 *
 * The BullMQ queue is intentionally not initialized (we never call
 * `onModuleInit`), so `enqueueSend` falls through to direct
 * `processCampaignSend` execution — exercising the full mass-send loop
 * without touching Redis. The EmailService is mocked.
 */

type CampaignStatus = 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'SENT';

interface FakeRecipient {
  id: string;
  email: string;
  name: string | null;
  workspaceId: string;
  status: 'PENDING' | 'SENT' | 'FAILED' | 'UNSUBSCRIBED' | 'DELIVERED';
}

interface FakeCampaign {
  id: string;
  workspaceId: string;
  name: string;
  subject: string;
  htmlBody: string;
  status: CampaignStatus;
  sentCount: number;
  failedCount: number;
  startedAt: Date | null;
  completedAt: Date | null;
  recipients: FakeRecipient[];
}

describe('EmailMarketingService.enqueueSend → processCampaignSend (E2E flow)', () => {
  let service: EmailMarketingService;
  let prisma: {
    emailCampaign: { findFirst: jest.Mock; findFirstOrThrow: jest.Mock; update: jest.Mock };
    emailCampaignDelivery: { create: jest.Mock };
    emailCampaignRecipient: { updateMany: jest.Mock };
    approvalRequest: { findFirst: jest.Mock };
  };
  let emailService: { sendEmail: jest.Mock };

  let campaign: FakeCampaign;
  let deliveryLog: Array<{
    campaignId: string;
    recipientId: string;
    workspaceId: string;
    event: 'SENT' | 'FAILED' | string;
  }>;
  let recipientUpdates: Array<{
    where: { id: string; workspaceId: string };
    data: { status: string };
  }>;

  function bootCampaign(overrides: Partial<FakeCampaign> = {}): FakeCampaign {
    const base: FakeCampaign = {
      id: 'camp-1',
      workspaceId: 'ws-1',
      name: 'Black Friday',
      subject: 'Oferta exclusiva',
      htmlBody: '<p>Ola {{name}}</p>',
      status: 'DRAFT',
      sentCount: 0,
      failedCount: 0,
      startedAt: null,
      completedAt: null,
      recipients: [
        { id: 'r-1', email: 'a@example.com', name: 'Ana', workspaceId: 'ws-1', status: 'PENDING' },
        { id: 'r-2', email: 'b@example.com', name: 'Bia', workspaceId: 'ws-1', status: 'PENDING' },
      ],
    };
    return { ...base, ...overrides };
  }

  let priorUnsubscribeSecret: string | undefined;

  beforeAll(() => {
    priorUnsubscribeSecret = process.env.EMAIL_UNSUBSCRIBE_SECRET;
    process.env.EMAIL_UNSUBSCRIBE_SECRET = 'test-secret-for-e2e-flow-spec';
  });

  afterAll(() => {
    if (priorUnsubscribeSecret === undefined) {
      delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
    } else {
      process.env.EMAIL_UNSUBSCRIBE_SECRET = priorUnsubscribeSecret;
    }
  });

  beforeEach(async () => {
    deliveryLog = [];
    recipientUpdates = [];
    campaign = bootCampaign();

    prisma = {
      emailCampaign: {
        findFirst: jest.fn(async (args: { where: { id: string; workspaceId: string } }) => {
          if (args.where.id !== campaign.id || args.where.workspaceId !== campaign.workspaceId) {
            return null;
          }
          return campaign;
        }),
        findFirstOrThrow: jest.fn(async () => campaign),
        update: jest.fn(
          async (args: {
            where: { id: string; workspaceId: string };
            data: Partial<FakeCampaign>;
          }) => {
            if (args.where.workspaceId !== campaign.workspaceId) {
              throw new Error('cross-workspace write blocked');
            }
            campaign = { ...campaign, ...args.data };
            return campaign;
          },
        ),
      },
      emailCampaignDelivery: {
        create: jest.fn(
          async (args: {
            data: {
              campaignId: string;
              recipientId: string;
              workspaceId: string;
              event: string;
            };
          }) => {
            deliveryLog.push(args.data);
            return { id: `dlv-${deliveryLog.length}` };
          },
        ),
      },
      emailCampaignRecipient: {
        updateMany: jest.fn(
          async (args: {
            where: { id: string; workspaceId: string };
            data: { status: string };
          }) => {
            recipientUpdates.push(args);
            return { count: 1 };
          },
        ),
      },
      approvalRequest: {
        findFirst: jest.fn().mockResolvedValue({ id: 'ap-1' }),
      },
    };

    emailService = { sendEmail: jest.fn().mockResolvedValue(true) };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        EmailMarketingService,
        { provide: PrismaService, useValue: prisma },
        { provide: EmailService, useValue: emailService },
      ],
    }).compile();

    service = moduleRef.get(EmailMarketingService);
  });

  afterEach(() => jest.clearAllMocks());

  it('drives the full DRAFT -> SCHEDULED -> SENDING -> SENT lifecycle with tracking rows', async () => {
    await service.enqueueSend('camp-1', 'ws-1');

    expect(campaign.status).toBe('SENT');
    expect(campaign.sentCount).toBe(2);
    expect(campaign.failedCount).toBe(0);
    expect(campaign.startedAt).toBeInstanceOf(Date);
    expect(campaign.completedAt).toBeInstanceOf(Date);

    expect(emailService.sendEmail).toHaveBeenCalledTimes(2);
    expect(deliveryLog).toHaveLength(2);
    expect(deliveryLog.every((row) => row.event === 'SENT')).toBe(true);
    expect(deliveryLog.every((row) => row.workspaceId === 'ws-1')).toBe(true);
    expect(recipientUpdates).toHaveLength(2);
    expect(recipientUpdates.every((u) => u.where.workspaceId === 'ws-1')).toBe(true);
    expect(recipientUpdates.every((u) => u.data.status === 'SENT')).toBe(true);
  });

  it('blocks enqueueSend when no APPROVED ApprovalRequest exists', async () => {
    prisma.approvalRequest.findFirst.mockResolvedValueOnce(null);

    await expect(service.enqueueSend('camp-1', 'ws-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(campaign.status).toBe('DRAFT');
    expect(emailService.sendEmail).not.toHaveBeenCalled();
    expect(deliveryLog).toHaveLength(0);
  });

  it('rejects sending a campaign whose status is not DRAFT (no double-send)', async () => {
    campaign = bootCampaign({ status: 'SENT' });
    await expect(service.enqueueSend('camp-1', 'ws-1')).rejects.toThrow(
      /Cannot send campaign in status: SENT/,
    );
    expect(emailService.sendEmail).not.toHaveBeenCalled();
  });

  it('rejects sending when the campaign does not belong to the calling workspace', async () => {
    await expect(service.enqueueSend('camp-1', 'ws-attacker')).rejects.toThrow(
      /Campaign not found/,
    );
    expect(emailService.sendEmail).not.toHaveBeenCalled();
    expect(deliveryLog).toHaveLength(0);
  });

  it('records FAILED for a recipient when the provider rejects and keeps sending the rest', async () => {
    campaign = bootCampaign({
      recipients: [
        {
          id: 'r-1',
          email: 'good@example.com',
          name: 'Good',
          workspaceId: 'ws-1',
          status: 'PENDING',
        },
        {
          id: 'r-2',
          email: 'bad@example.com',
          name: 'Bad',
          workspaceId: 'ws-1',
          status: 'PENDING',
        },
        {
          id: 'r-3',
          email: 'good2@example.com',
          name: 'Good2',
          workspaceId: 'ws-1',
          status: 'PENDING',
        },
      ],
    });
    emailService.sendEmail.mockImplementation(async (opts: { to: string }) => {
      if (opts.to === 'bad@example.com') {
        throw new Error('provider_5xx');
      }
      return true;
    });

    await service.enqueueSend('camp-1', 'ws-1');

    expect(campaign.status).toBe('SENT');
    expect(campaign.sentCount).toBe(2);
    expect(campaign.failedCount).toBe(1);
    expect(deliveryLog).toHaveLength(3);
    const failed = deliveryLog.find((d) => d.recipientId === 'r-2');
    expect(failed?.event).toBe('FAILED');
    const successes = deliveryLog.filter((d) => d.event === 'SENT');
    expect(successes.map((d) => d.recipientId).sort()).toEqual(['r-1', 'r-3']);
  });

  it('records FAILED with provider_failure marker when sendEmail returns false', async () => {
    campaign = bootCampaign({
      recipients: [
        { id: 'r-1', email: 'a@example.com', name: 'A', workspaceId: 'ws-1', status: 'PENDING' },
      ],
    });
    emailService.sendEmail.mockResolvedValueOnce(false);

    await service.enqueueSend('camp-1', 'ws-1');

    expect(campaign.sentCount).toBe(0);
    expect(campaign.failedCount).toBe(1);
    expect(deliveryLog).toHaveLength(1);
    expect(deliveryLog[0]?.event).toBe('FAILED');
  });

  it('skips UNSUBSCRIBED recipients with no SENT/FAILED side effects', async () => {
    campaign = bootCampaign({
      recipients: [
        {
          id: 'r-1',
          email: 'opt@example.com',
          name: 'Opt',
          workspaceId: 'ws-1',
          status: 'UNSUBSCRIBED',
        },
        { id: 'r-2', email: 'b@example.com', name: 'B', workspaceId: 'ws-1', status: 'PENDING' },
      ],
    });

    await service.enqueueSend('camp-1', 'ws-1');

    expect(emailService.sendEmail).toHaveBeenCalledTimes(1);
    type SendArg = readonly [{ to: string }];
    const sendCalls = emailService.sendEmail.mock.calls as readonly SendArg[];
    expect(sendCalls[0]?.[0]?.to).toBe('b@example.com');
    expect(deliveryLog).toHaveLength(1);
    expect(deliveryLog[0]?.recipientId).toBe('r-2');
    expect(campaign.sentCount).toBe(1);
    expect(campaign.failedCount).toBe(0);
  });

  it('personalizes the email body per recipient with {{name}} replacement', async () => {
    campaign = bootCampaign({
      htmlBody: '<p>Ola {{name}}, oferta especial</p>',
      recipients: [
        { id: 'r-1', email: 'a@example.com', name: 'Ana', workspaceId: 'ws-1', status: 'PENDING' },
        { id: 'r-2', email: 'b@example.com', name: null, workspaceId: 'ws-1', status: 'PENDING' },
      ],
    });

    await service.enqueueSend('camp-1', 'ws-1');

    type SendArg = readonly [{ to: string; html: string }];
    const calls = emailService.sendEmail.mock.calls as readonly SendArg[];
    const anaCall = calls.find((c) => c[0].to === 'a@example.com');
    const bCall = calls.find((c) => c[0].to === 'b@example.com');
    expect(anaCall?.[0].html).toContain('Ola Ana');
    expect(bCall?.[0].html).toContain('Ola Cliente');
  });

  it('persists every delivery row scoped to the campaign workspaceId (isolation)', async () => {
    await service.enqueueSend('camp-1', 'ws-1');

    expect(deliveryLog.length).toBeGreaterThan(0);
    for (const row of deliveryLog) {
      expect(row.workspaceId).toBe('ws-1');
      expect(row.campaignId).toBe('camp-1');
    }
    for (const update of recipientUpdates) {
      expect(update.where.workspaceId).toBe('ws-1');
    }
  });

  it('asserts the approval lookup filters by the calling workspace + kind + entity', async () => {
    await service.enqueueSend('camp-1', 'ws-1');

    type ApprovalCall = readonly [
      {
        where: {
          workspaceId: string;
          kind: string;
          entityType: string;
          entityId: string;
          state: { in: string[] };
        };
      },
    ];
    const calls = prisma.approvalRequest.findFirst.mock.calls as readonly ApprovalCall[];
    const where = calls[0]?.[0]?.where;
    expect(where).toMatchObject({
      workspaceId: 'ws-1',
      kind: 'email_campaign:send',
      entityType: 'EmailCampaign',
      entityId: 'camp-1',
    });
    expect(where?.state?.in).toEqual(expect.arrayContaining(['APPROVED', 'COMPLETED']));
  });
});
