import { CheckoutSocialLeadStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../auth/email.service';
import { FollowUpService } from '../followup/followup.service';
import { CheckoutSocialLeadService } from './checkout-social-lead.service';
import { CheckoutSocialRecoveryService } from './checkout-social-recovery.service';

jest.mock('../common/utils/unsubscribe-footer.util', () => ({
  buildListUnsubscribeHeader: jest.fn().mockReturnValue('<mailto:unsubscribe@test>'),
  buildUnsubscribeFooterHtml: jest.fn().mockReturnValue('<footer>unsubscribe</footer>'),
}));

type PrismaMock = {
  checkoutSocialLead: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
  };
  workspace: {
    findMany: jest.Mock;
  };
  $transaction: jest.Mock;
};

describe('CheckoutSocialRecoveryService', () => {
  let service: CheckoutSocialRecoveryService;
  let prisma: PrismaMock;
  let emailService: { sendEmail: jest.Mock };
  let followUpService: { create: jest.Mock };
  let socialLeadService: { syncLeadContact: jest.Mock };
  let txFindFirst: jest.Mock;

  beforeEach(() => {
    emailService = { sendEmail: jest.fn().mockResolvedValue(true) };
    followUpService = { create: jest.fn().mockResolvedValue({}) };
    socialLeadService = { syncLeadContact: jest.fn().mockResolvedValue('contact-1') };

    const emptyLeads: Array<unknown> = [];
    txFindFirst = jest.fn().mockResolvedValue(null);

    prisma = {
      checkoutSocialLead: {
        findMany: jest.fn().mockResolvedValue(emptyLeads),
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({ id: 'lead-1', workspaceId: 'ws-1' }),
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
      $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
        cb({
          checkoutSocialLead: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'lead-tx',
              workspaceId: 'ws-1',
              phone: '+5511999999999',
              contactId: null,
              recoveryWhatsAppSentAt: null,
              recoveryEmailSentAt: null,
            }),
            findFirst: txFindFirst,
            update: jest.fn().mockResolvedValue({ id: 'lead-tx', workspaceId: 'ws-1' }),
          },
        }),
      ),
    };

    service = new CheckoutSocialRecoveryService(
      prisma as unknown as PrismaService,
      emailService as unknown as EmailService,
      followUpService as unknown as FollowUpService,
      socialLeadService as unknown as CheckoutSocialLeadService,
    );
  });

  describe('recoverAbandonedLeads', () => {
    it('resolves successfully with empty leads', async () => {
      await expect(service.recoverAbandonedLeads()).resolves.toBeUndefined();
    });

    it('marks old leads as ABANDONED when eligible', async () => {
      const oldLead = {
        id: 'lead-old',
        workspaceId: 'ws-1',
        checkoutSlug: 'plan-1',
        name: 'Old Lead',
        email: 'old@test.com',
        phone: null,
        recoveryWhatsAppSentAt: null,
        recoveryEmailSentAt: null,
        abandonedAt: null,
        createdAt: new Date(Date.now() - 90 * 60 * 1000),
      };
      prisma.checkoutSocialLead.findMany.mockResolvedValue([oldLead]);

      await service.recoverAbandonedLeads();

      expect(prisma.checkoutSocialLead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: CheckoutSocialLeadStatus.ABANDONED }),
        }),
      );
    });

    it('dispatches WhatsApp recovery for abandoned lead with active channel', async () => {
      const leadWithPhone = {
        id: 'lead-wa',
        workspaceId: 'ws-1',
        checkoutSlug: 'plan-1',
        name: 'WA User',
        email: null,
        phone: '+5511999999999',
        recoveryWhatsAppSentAt: null,
        recoveryEmailSentAt: null,
        abandonedAt: new Date(),
        createdAt: new Date(Date.now() - 90 * 60 * 1000),
      };
      prisma.checkoutSocialLead.findMany.mockResolvedValue([leadWithPhone]);

      await service.recoverAbandonedLeads();

      expect(followUpService.create).toHaveBeenCalled();
    });

    it('does not dispatch email when lead has no email', async () => {
      const leadNoEmail = {
        id: 'lead-noemail',
        workspaceId: 'ws-1',
        checkoutSlug: 'plan-1',
        name: 'No Email',
        email: null,
        phone: null,
        recoveryWhatsAppSentAt: new Date(),
        recoveryEmailSentAt: null,
        abandonedAt: new Date(),
        createdAt: new Date(Date.now() - 90 * 60 * 1000),
      };
      prisma.checkoutSocialLead.findMany.mockResolvedValue([leadNoEmail]);

      await service.recoverAbandonedLeads();

      expect(emailService.sendEmail).not.toHaveBeenCalled();
    });

    it('dispatches email recovery for lead with email and active channel', async () => {
      const leadWithEmail = {
        id: 'lead-email',
        workspaceId: 'ws-1',
        checkoutSlug: 'plan-1',
        name: 'Email User',
        email: 'email@test.com',
        phone: null,
        recoveryWhatsAppSentAt: new Date(),
        recoveryEmailSentAt: null,
        abandonedAt: new Date(),
        createdAt: new Date(Date.now() - 90 * 60 * 1000),
      };
      prisma.checkoutSocialLead.findMany.mockResolvedValue([leadWithEmail]);
      txFindFirst.mockResolvedValueOnce({ id: 'lead-email', recoveryEmailSentAt: null });

      await service.recoverAbandonedLeads();

      expect(emailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'email@test.com',
          subject: expect.stringContaining('checkout'),
        }),
      );
    });
  });
});
