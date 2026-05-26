import { CheckoutSocialLeadStatus, Prisma } from '@prisma/client';
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
      prisma as PrismaService,
      emailService as EmailService,
      followUpService as FollowUpService,
      socialLeadService as CheckoutSocialLeadService,
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

    // ── Wave 22 error resilience ──

    it('continues processing remaining leads when one lead throws P2025 in markAbandonedIfEligible', async () => {
      const p2025 = new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
      const goodLead = {
        id: 'lead-good',
        workspaceId: 'ws-1',
        checkoutSlug: 'plan-1',
        name: 'Good Lead',
        email: 'good@test.com',
        phone: null,
        recoveryWhatsAppSentAt: new Date(),
        recoveryEmailSentAt: null,
        abandonedAt: new Date(),
        createdAt: new Date(Date.now() - 90 * 60 * 1000),
      };
      const badLead = {
        id: 'lead-bad',
        workspaceId: 'ws-1',
        checkoutSlug: 'plan-1',
        name: 'Bad Lead',
        email: null,
        phone: null,
        recoveryWhatsAppSentAt: null,
        recoveryEmailSentAt: null,
        abandonedAt: null,
        createdAt: new Date(Date.now() - 90 * 60 * 1000),
      };
      prisma.checkoutSocialLead.findMany.mockResolvedValue([badLead, goodLead]);

      // first lead's markAbandonedIfEligible throws P2025 → should be caught, batch continues
      prisma.checkoutSocialLead.update
        .mockRejectedValueOnce(p2025) // badLead update fails
        .mockResolvedValueOnce({ id: 'lead-good', workspaceId: 'ws-1' }); // goodLead markAbandoned
      txFindFirst.mockResolvedValueOnce({ id: 'lead-good', recoveryEmailSentAt: null });

      await service.recoverAbandonedLeads();

      // goodLead should still get its email
      expect(emailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'good@test.com' }),
      );
    });

    it('continues processing remaining leads when WhatsApp dispatch transaction throws P2025', async () => {
      const p2025 = new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
      const waLead = {
        id: 'lead-wa-fail',
        workspaceId: 'ws-1',
        checkoutSlug: 'plan-1',
        name: 'WA Fail',
        email: null,
        phone: '+5511999999999',
        recoveryWhatsAppSentAt: null,
        recoveryEmailSentAt: null,
        abandonedAt: new Date(),
        createdAt: new Date(Date.now() - 90 * 60 * 1000),
      };
      const emailLead = {
        id: 'lead-email-ok',
        workspaceId: 'ws-1',
        checkoutSlug: 'plan-1',
        name: 'Email OK',
        email: 'emailok@test.com',
        phone: null,
        recoveryWhatsAppSentAt: new Date(),
        recoveryEmailSentAt: null,
        abandonedAt: new Date(),
        createdAt: new Date(Date.now() - 90 * 60 * 1000),
      };
      prisma.checkoutSocialLead.findMany.mockResolvedValue([waLead, emailLead]);

      // WhatsApp transaction throws P2025
      prisma.$transaction.mockRejectedValueOnce(p2025);
      txFindFirst.mockResolvedValueOnce({ id: 'lead-email-ok', recoveryEmailSentAt: null });

      await service.recoverAbandonedLeads();

      // second lead should still get its email
      expect(emailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'emailok@test.com' }),
      );
    });

    it('continues processing when one lead throws a non-Prisma error (ALERT_AND_SKIP)', async () => {
      const networkError = new Error('network timeout');
      const badLead = {
        id: 'lead-net-fail',
        workspaceId: 'ws-1',
        checkoutSlug: 'plan-1',
        name: 'Net Fail',
        email: null,
        phone: null,
        recoveryWhatsAppSentAt: null,
        recoveryEmailSentAt: null,
        abandonedAt: null,
        createdAt: new Date(Date.now() - 90 * 60 * 1000),
      };
      const goodLead = {
        id: 'lead-net-ok',
        workspaceId: 'ws-1',
        checkoutSlug: 'plan-1',
        name: 'Net OK',
        email: 'netok@test.com',
        phone: null,
        recoveryWhatsAppSentAt: new Date(),
        recoveryEmailSentAt: null,
        abandonedAt: new Date(),
        createdAt: new Date(Date.now() - 90 * 60 * 1000),
      };
      prisma.checkoutSocialLead.findMany.mockResolvedValue([badLead, goodLead]);

      // markAbandonedIfEligible throws non-Prisma (rethrows past the existing P2025 guard)
      prisma.checkoutSocialLead.update.mockRejectedValueOnce(networkError);
      txFindFirst.mockResolvedValueOnce({ id: 'lead-net-ok', recoveryEmailSentAt: null });

      await service.recoverAbandonedLeads();

      // goodLead should still get processed
      expect(emailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'netok@test.com' }),
      );
    });

    it('handles P2025 in dispatchEmailRecovery rollback without crashing', async () => {
      const p2025 = new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
      const lead = {
        id: 'lead-rollback',
        workspaceId: 'ws-1',
        checkoutSlug: 'plan-1',
        name: 'Rollback Lead',
        email: 'rollback@test.com',
        phone: null,
        recoveryWhatsAppSentAt: new Date(),
        recoveryEmailSentAt: null,
        abandonedAt: new Date(),
        createdAt: new Date(Date.now() - 90 * 60 * 1000),
      };
      prisma.checkoutSocialLead.findMany.mockResolvedValue([lead]);
      txFindFirst.mockResolvedValueOnce({ id: 'lead-rollback', recoveryEmailSentAt: null });
      emailService.sendEmail.mockResolvedValueOnce(false); // triggers rollback

      // rollback update throws P2025 → should be caught, not crash the batch
      prisma.checkoutSocialLead.update.mockRejectedValueOnce(p2025);

      await service.recoverAbandonedLeads();

      // batch completes without throwing
      expect(emailService.sendEmail).toHaveBeenCalled();
    });
  });
});
