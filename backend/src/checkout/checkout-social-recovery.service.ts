import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CheckoutSocialLeadStatus } from '@prisma/client';
import { EmailService } from '../auth/email.service';
import { forEachSequential } from '../common/async-sequence';
import { FollowUpService } from '../followup/followup.service';
import { PrismaService } from '../prisma/prisma.service';
import { CheckoutSocialLeadService } from './checkout-social-lead.service';

const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

/** Checkout social recovery service. */
@Injectable()
export class CheckoutSocialRecoveryService {
  private readonly logger = new Logger(CheckoutSocialRecoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly followUpService: FollowUpService,
    private readonly socialLeadService: CheckoutSocialLeadService,
  ) {}

  /** Recover abandoned leads. */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async recoverAbandonedLeads() {
    const now = Date.now();
    const leads = await this.prisma.checkoutSocialLead.findMany({
      where: {
        convertedAt: null,
        OR: [
          { status: CheckoutSocialLeadStatus.CAPTURED },
          { status: CheckoutSocialLeadStatus.ENRICHED },
          { status: CheckoutSocialLeadStatus.ABANDONED },
        ],
      },
      select: {
        id: true,
        workspaceId: true,
        checkoutSlug: true,
        name: true,
        email: true,
        phone: true,
        recoveryWhatsAppSentAt: true,
        recoveryEmailSentAt: true,
        abandonedAt: true,
        createdAt: true,
      },
      take: 200,
      orderBy: { createdAt: 'asc' },
    });

    await forEachSequential(leads, async (lead) => {
      const age = now - lead.createdAt.getTime();

      if (!lead.abandonedAt && age >= THIRTY_MINUTES_MS) {
        await this.prisma.checkoutSocialLead.update({
          where: { id: lead.id },
          data: {
            status: CheckoutSocialLeadStatus.ABANDONED,
            abandonedAt: new Date(),
          },
        });
      }

      if (age >= THIRTY_MINUTES_MS && !lead.recoveryWhatsAppSentAt) {
        await this.dispatchWhatsAppRecovery(lead.id);
      }

      if (age >= ONE_HOUR_MS && !lead.recoveryEmailSentAt && lead.email) {
        await this.dispatchEmailRecovery(lead.id, lead.email, lead.name, lead.checkoutSlug);
      }
    });
  }

  private async dispatchWhatsAppRecovery(leadId: string) {
    await this.prisma.$transaction(async (tx) => {
      const l = await tx.checkoutSocialLead.findUnique({
        where: { id: leadId },
        select: {
          id: true,
          workspaceId: true,
          name: true,
          phone: true,
          contactId: true,
          recoveryWhatsAppSentAt: true,
        },
      });

      if (!l?.phone || l.recoveryWhatsAppSentAt) {
        return null;
      }

      const contactId = l.contactId || (await this.socialLeadService.syncLeadContact(l.id));
      if (!contactId) {
        return null;
      }

      await this.followUpService.create(l.workspaceId, {
        contactId,
        scheduledFor: new Date(),
        reason: 'checkout_social_abandon_recovery',
        message: `Oi${l.name ? `, ${l.name}` : ''}. Vi que você começou seu checkout no KLOEL e parou no meio. Posso te ajudar a concluir?`,
      });

      return tx.checkoutSocialLead.update({
        where: { id: l.id },
        data: { recoveryWhatsAppSentAt: new Date() },
      });
    });
  }

  private async dispatchEmailRecovery(
    leadId: string,
    email: string,
    name: string | null,
    checkoutSlug: string,
  ) {
    const sent = await this.emailService.sendEmail({
      to: email,
      subject: 'Seu checkout no KLOEL ficou aberto',
      html: this.renderRecoveryEmail(name, checkoutSlug),
    });

    if (!sent) {
      this.logger.warn(`Falha ao enviar recovery email para lead ${leadId}.`);
      return;
    }

    await this.prisma.checkoutSocialLead.update({
      where: { id: leadId },
      data: { recoveryEmailSentAt: new Date() },
    });
  }

  private renderRecoveryEmail(name: string | null, checkoutSlug: string) {
    const safeName = String(name || '').trim();
    const productLine = checkoutSlug ? `checkout ${checkoutSlug}` : 'checkout';

    return `
      <div style="font-family:Arial,sans-serif;background:#f6f6f6;padding:24px;">
        <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;">
          <p style="font-size:14px;color:#64748b;margin:0 0 12px;">KLOEL</p>
          <h1 style="font-size:24px;color:#0f172a;margin:0 0 16px;">${safeName ? `Oi, ${safeName}.` : 'Oi.'}</h1>
          <p style="font-size:16px;line-height:1.6;color:#334155;margin:0 0 12px;">
            Percebemos que você começou o ${productLine} e não terminou.
          </p>
          <p style="font-size:16px;line-height:1.6;color:#334155;margin:0;">
            Se ainda quiser concluir sua compra, volte para o checkout e retome de onde parou.
          </p>
        </div>
      </div>
    `;
  }
}
