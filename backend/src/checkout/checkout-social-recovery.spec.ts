import { expectValueOf } from '../../test/expect-value-of';
import { CheckoutSocialRecoveryService } from './checkout-social-recovery.service';
import { CheckoutSocialLeadStatus } from '@prisma/client';

jest.mock('../common/utils/email-template-renderer.util', () => ({
  renderEmailTemplate: jest.fn().mockReturnValue('<p>Email renderizado</p>'),
}));

jest.mock('../common/utils/unsubscribe-footer.util', () => ({
  buildListUnsubscribeHeader: jest.fn().mockReturnValue('<mailto:unsubscribe@kloel.com>'),
  buildUnsubscribeFooterHtml: jest.fn().mockReturnValue('<footer>Unsubscribe</footer>'),
}));

describe('CheckoutSocialRecoveryService', () => {
  let prisma: {
    checkoutSocialLead: {
      findMany: jest.Mock;
      update: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
    };
    workspace: {
      findMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let emailService: { sendEmail: jest.Mock };
  let followUpService: { create: jest.Mock };
  let socialLeadService: { syncLeadContact: jest.Mock };
  let service: CheckoutSocialRecoveryService;

  const now = new Date('2026-05-11T12:00:00.000Z');
  const thirtyMinAgo = new Date(now.getTime() - 31 * 60 * 1000);
  const sixtyMinAgo = new Date(now.getTime() - 61 * 60 * 1000);
  const twentyMinAgo = new Date(now.getTime() - 20 * 60 * 1000);

  function makeLead(overrides: Record<string, unknown> = {}) {
    return {
      id: 'lead-1',
      workspaceId: 'ws-1',
      checkoutSlug: 'meu-produto',
      name: 'Joao',
      email: 'joao@example.com',
      phone: '5511999999999',
      recoveryWhatsAppSentAt: null,
      recoveryEmailSentAt: null,
      abandonedAt: null,
      createdAt: thirtyMinAgo,
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);

    prisma = {
      checkoutSocialLead: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({ id: 'lead-1', workspaceId: 'ws-1' }),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      workspace: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'ws-1',
            providerSettings: {
              whatsappProvider: 'meta',
              connectionStatus: 'connected',
            },
          },
        ]),
      },
      $transaction: jest.fn().mockImplementation(async (fn: unknown) => {
        if (typeof fn === 'function') {
          return fn(prisma);
        }
        return await Promise.resolve((fn as Array<Promise<unknown>>)[0]);
      }),
    };

    emailService = { sendEmail: jest.fn().mockResolvedValue(true) };
    followUpService = { create: jest.fn().mockResolvedValue(undefined) };
    socialLeadService = { syncLeadContact: jest.fn().mockResolvedValue('contact-1') };

    service = new CheckoutSocialRecoveryService(
      prisma as never,
      emailService as never,
      followUpService as never,
      socialLeadService as never,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('marks lead as ABANDONED after 30 minutes', async () => {
    const lead = makeLead({ createdAt: thirtyMinAgo, abandonedAt: null });
    prisma.checkoutSocialLead.findMany.mockResolvedValue([lead]);

    await service.recoverAbandonedLeads();

    expect(prisma.checkoutSocialLead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: CheckoutSocialLeadStatus.ABANDONED,
        }),
      }),
    );
  });

  it('dispatches WhatsApp recovery when no recoveryWhatsAppSentAt and phone exists', async () => {
    const lead = makeLead({
      createdAt: thirtyMinAgo,
      abandonedAt: thirtyMinAgo,
      recoveryWhatsAppSentAt: null,
      phone: '5511999999999',
      contactId: 'contact-abc',
    });
    prisma.checkoutSocialLead.findMany.mockResolvedValue([lead]);

    prisma.checkoutSocialLead.findUnique.mockResolvedValueOnce({
      id: 'lead-1',
      workspaceId: 'ws-1',
      name: 'Joao',
      phone: '5511999999999',
      contactId: 'contact-abc',
      recoveryWhatsAppSentAt: null,
    });

    await service.recoverAbandonedLeads();

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(followUpService.create).toHaveBeenCalledWith(
      'ws-1',
      expect.objectContaining({
        contactId: 'contact-abc',
        reason: 'checkout_social_abandon_recovery',
      }),
    );
  });

  it('dispatches Email recovery after 60 minutes with List-Unsubscribe headers', async () => {
    const lead = makeLead({
      createdAt: sixtyMinAgo,
      abandonedAt: sixtyMinAgo,
      recoveryEmailSentAt: null,
      email: 'joao@example.com',
      recoveryWhatsAppSentAt: sixtyMinAgo,
    });
    prisma.checkoutSocialLead.findMany.mockResolvedValue([lead]);
    prisma.checkoutSocialLead.findFirst.mockResolvedValueOnce({
      id: 'lead-1',
      recoveryEmailSentAt: null,
    });

    await service.recoverAbandonedLeads();

    expect(emailService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'joao@example.com',
        headers: expect.objectContaining({
          'List-Unsubscribe': expectValueOf(String),
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        }),
      }),
    );
  });

  it('rolls back recoveryEmailSentAt when email send fails', async () => {
    const lead = makeLead({
      createdAt: sixtyMinAgo,
      abandonedAt: sixtyMinAgo,
      recoveryEmailSentAt: null,
      email: 'joao@example.com',
      recoveryWhatsAppSentAt: sixtyMinAgo,
    });
    prisma.checkoutSocialLead.findMany.mockResolvedValue([lead]);
    prisma.checkoutSocialLead.findFirst.mockResolvedValueOnce({
      id: 'lead-1',
      recoveryEmailSentAt: null,
    });
    emailService.sendEmail.mockResolvedValue(false);

    await service.recoverAbandonedLeads();

    expect(prisma.checkoutSocialLead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { recoveryEmailSentAt: null },
      }),
    );
  });

  it('skips already-recovered leads (idempotent)', async () => {
    const lead = makeLead({
      createdAt: sixtyMinAgo,
      abandonedAt: sixtyMinAgo,
      recoveryWhatsAppSentAt: thirtyMinAgo,
      recoveryEmailSentAt: thirtyMinAgo,
    });
    prisma.checkoutSocialLead.findMany.mockResolvedValue([lead]);

    await service.recoverAbandonedLeads();

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(emailService.sendEmail).not.toHaveBeenCalled();
  });

  it('skips leads younger than 30 minutes', async () => {
    const lead = makeLead({
      createdAt: twentyMinAgo,
      abandonedAt: null,
      recoveryWhatsAppSentAt: null,
      recoveryEmailSentAt: null,
    });
    prisma.checkoutSocialLead.findMany.mockResolvedValue([lead]);

    await service.recoverAbandonedLeads();

    expect(prisma.checkoutSocialLead.update).not.toHaveBeenCalled();
    expect(emailService.sendEmail).not.toHaveBeenCalled();
  });
});
