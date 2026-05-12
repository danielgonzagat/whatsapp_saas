import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CheckoutSocialLeadStatus, Prisma } from '@prisma/client';
import { EmailService } from '../auth/email.service';
import { forEachSequential } from '../common/async-sequence';
import { FollowUpService } from '../followup/followup.service';
import { PrismaService } from '../prisma/prisma.service';
import { CheckoutSocialLeadService } from './checkout-social-lead.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import {
  buildListUnsubscribeHeader,
  buildUnsubscribeFooterHtml,
} from '../common/utils/unsubscribe-footer.util';

const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

type RecoveryLead = {
  id: string;
  workspaceId: string;
  checkoutSlug: string;
  name: string | null;
  email: string | null;
  recoveryWhatsAppSentAt: Date | null;
  recoveryEmailSentAt: Date | null;
  abandonedAt: Date | null;
  createdAt: Date;
};

type WorkspaceChannelState = {
  whatsappActive: boolean;
  emailActive: boolean;
};

/** Checkout social recovery service with deterministic channel constraints. */
@Injectable()
export class CheckoutSocialRecoveryService {
  private readonly logger = new Logger(CheckoutSocialRecoveryService.name);
  private readonly workspaceChannels = new Map<
    string,
    { state: WorkspaceChannelState; fetchedAt: number }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly followUpService: FollowUpService,
    private readonly socialLeadService: CheckoutSocialLeadService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  /** Recover abandoned leads with deterministic channel-gate decisions. */
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

    const workspaceIds = [...new Set(leads.map((l) => l.workspaceId))];
    await this.warmChannelStates(workspaceIds);

    await forEachSequential(leads, async (lead) => {
      const age = now - lead.createdAt.getTime();
      const channels = this.getChannelState(lead.workspaceId);

      await this.markAbandonedIfEligible(lead, age);

      if (this.shouldDispatchWhatsAppRecovery(lead, age, channels)) {
        await this.dispatchWhatsAppRecovery(lead.id);
      }

      if (this.shouldDispatchEmailRecovery(lead, age, channels)) {
        await this.dispatchEmailRecovery(
          lead.id,
          lead.workspaceId,
          lead.email,
          lead.name,
          lead.checkoutSlug,
        );
      }
    });
  }

  private async warmChannelStates(workspaceIds: string[]) {
    const now = Date.now();
    const cacheTtl = 5 * 60 * 1000;

    const missing = workspaceIds.filter((id) => {
      const entry = this.workspaceChannels.get(id);
      return !entry || now - entry.fetchedAt > cacheTtl;
    });

    if (missing.length === 0) return;

    const workspaces = await this.prisma.workspace.findMany({
      where: { id: { in: missing } },
      select: { id: true, providerSettings: true },
    });

    for (const ws of workspaces) {
      const settings = (ws.providerSettings ?? {}) as Record<string, unknown>;
      const whatsappProvider = settings.whatsappProvider;
      const connectionStatus = settings.connectionStatus;

      this.workspaceChannels.set(ws.id, {
        state: {
          whatsappActive: typeof whatsappProvider === 'string' && connectionStatus === 'connected',
          emailActive: true,
        },
        fetchedAt: now,
      });
    }

    for (const id of missing) {
      if (!this.workspaceChannels.has(id)) {
        this.workspaceChannels.set(id, {
          state: { whatsappActive: false, emailActive: true },
          fetchedAt: now,
        });
      }
    }
  }

  private getChannelState(workspaceId: string): WorkspaceChannelState {
    return (
      this.workspaceChannels.get(workspaceId)?.state ?? {
        whatsappActive: false,
        emailActive: true,
      }
    );
  }

  private async markAbandonedIfEligible(lead: RecoveryLead, age: number) {
    if (lead.abandonedAt || age < THIRTY_MINUTES_MS) {
      return;
    }

    try {
      await this.prisma.checkoutSocialLead.update({
        where: { id: lead.id, workspaceId: lead.workspaceId },
        data: {
          status: CheckoutSocialLeadStatus.ABANDONED,
          abandonedAt: new Date(),
        },
        select: { id: true, workspaceId: true },
      });
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(
        error,
        'CheckoutSocialRecoveryService.markAbandonedIfEligible',
      );
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025')) {
        throw error;
      }
    }
  }

  private shouldDispatchWhatsAppRecovery(
    lead: RecoveryLead,
    age: number,
    channels: WorkspaceChannelState,
  ) {
    if (!channels.whatsappActive) return false;
    return age >= THIRTY_MINUTES_MS && !lead.recoveryWhatsAppSentAt;
  }

  private shouldDispatchEmailRecovery(
    lead: RecoveryLead,
    age: number,
    channels: WorkspaceChannelState,
  ): lead is RecoveryLead & { email: string } {
    if (!channels.emailActive) return false;
    return age >= ONE_HOUR_MS && !lead.recoveryEmailSentAt && Boolean(lead.email);
  }

  private async dispatchWhatsAppRecovery(leadId: string) {
    await this.prisma.$transaction(
      async (tx) => {
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
          select: { id: true, workspaceId: true },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  private async dispatchEmailRecovery(
    leadId: string,
    workspaceId: string,
    email: string,
    name: string | null,
    checkoutSlug: string,
  ) {
    // recovery runs from both sending email to the same lead
    const alreadySent = await this.prisma.$transaction(async (tx) => {
      const lead = await tx.checkoutSocialLead.findFirst({
        where: { id: leadId, workspaceId },
        select: { id: true, recoveryEmailSentAt: true },
      });
      if (!lead || lead.recoveryEmailSentAt) {
        return true;
      }

      await tx.checkoutSocialLead.update({
        where: { id: leadId },
        data: { recoveryEmailSentAt: new Date() },
        select: { id: true, workspaceId: true },
      });
      return false;
    });

    if (alreadySent) {
      return;
    }

    const unsubscribeFooter = buildUnsubscribeFooterHtml({ email, workspaceId });
    const listUnsubscribe = buildListUnsubscribeHeader({ email, workspaceId });

    const sent = await this.emailService.sendEmail({
      to: email,
      subject: 'Seu checkout no KLOEL ficou aberto',
      html: `${this.renderRecoveryEmail(name, checkoutSlug)}${unsubscribeFooter}`,
      headers: {
        'List-Unsubscribe': listUnsubscribe,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });

    if (!sent) {
      this.logger.warn(`Falha ao enviar recovery email para lead ${leadId}.`);
      await this.prisma.checkoutSocialLead.update({
        where: { id: leadId },
        data: { recoveryEmailSentAt: null },
        select: { id: true, workspaceId: true },
      });
    }
  }

  private renderRecoveryEmail(name: string | null, checkoutSlug: string) {
    const safeName = String(name || '').trim();
    const productLine = checkoutSlug ? `checkout ${checkoutSlug}` : 'checkout';
    const greeting = safeName ? `Oi, ${safeName}.` : 'Oi.';
    const { renderEmailTemplate } = require('../common/utils/email-template-renderer.util');
    return renderEmailTemplate('social-recovery', { greeting, productLine });
  }
}
