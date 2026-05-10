import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { EmailService } from '../auth/email.service';
import { getRedisUrl } from '../common/redis/redis.util';
import {
  buildListUnsubscribeHeader,
  buildUnsubscribeFooterHtml,
} from '../common/utils/unsubscribe-footer.util';
import { OpsAlertService } from '../observability/ops-alert.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateEmailCampaignDto } from './dto/create-email-campaign.dto';
import type { EmailCampaign, EmailCampaignRecipient, EmailCampaignDelivery } from '@prisma/client';

const NAME_RE = /\{\{name\}\}/g;

type EmailCampaignJob = {
  campaignId: string;
  workspaceId: string;
};

type EmailDeliveryLog = {
  campaignId: string;
  recipientId: string;
  workspaceId: string;
  event: 'SENT' | 'FAILED';
  providerMessageId?: string;
  errorMessage?: string;
};

const QUEUE_NAME = 'email-marketing-jobs';

type EmailCampaignWithRecipients = EmailCampaign & {
  recipients: EmailCampaignRecipient[];
};

type EmailCampaignWithDeliveries = EmailCampaign & {
  recipients: (EmailCampaignRecipient & {
    deliveries: EmailCampaignDelivery[];
  })[];
};

type CampaignListRow = Pick<
  EmailCampaign,
  | 'id'
  | 'name'
  | 'subject'
  | 'status'
  | 'totalRecipients'
  | 'sentCount'
  | 'deliveredCount'
  | 'openedCount'
  | 'clickedCount'
  | 'repliedCount'
  | 'failedCount'
  | 'provider'
  | 'createdAt'
  | 'updatedAt'
>;

@Injectable()
export class EmailMarketingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailMarketingService.name);
  private queue: Queue<EmailCampaignJob> | null = null;
  private worker: Worker<EmailCampaignJob> | null = null;
  private readonly fromEmail = process.env.EMAIL_FROM || 'noreply@kloel.com';
  private readonly fromName = process.env.EMAIL_FROM_NAME || 'KLOEL';

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  onModuleInit() {
    void this.initWorker();
  }

  async onModuleDestroy() {
    await Promise.all([this.worker?.close(), this.queue?.close()]);
  }

  private initWorker() {
    try {
      const connection = { url: getRedisUrl() };
      this.queue = new Queue<EmailCampaignJob>(QUEUE_NAME, { connection });
      this.worker = new Worker<EmailCampaignJob>(
        QUEUE_NAME,
        async (job) => {
          const { campaignId, workspaceId } = job.data;
          this.logger.log(`Processing email campaign job: ${campaignId}`);
          await this.processCampaignSend(campaignId, workspaceId);
        },
        {
          connection,
          concurrency: 1,
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 50 },
        },
      );

      this.worker.on('completed', (job) => {
        this.logger.log(`Email campaign job completed: ${job.data.campaignId}`);
      });

      this.worker.on('failed', (job, err) => {
        this.logger.error(`Email campaign job failed: ${job?.data.campaignId}: ${err.message}`);
      });

      this.logger.log('Email marketing queue worker started');
    } catch (err) {
      void this.opsAlert?.alertOnCriticalError(err, 'EmailMarketingService.initWorker');
      this.logger.warn(
        `Redis not available — email marketing scheduling disabled (${(err as Error)?.message})`,
      );
    }
  }

  private getProvider(): 'resend' | 'sendgrid' | 'smtp' | 'log' {
    if (process.env.RESEND_API_KEY) {
      return 'resend';
    }
    if (process.env.SENDGRID_API_KEY) {
      return 'sendgrid';
    }
    if (process.env.SMTP_HOST) {
      return 'smtp';
    }
    return 'log';
  }

  // ========================================
  // CAMPAIGN CRUD
  // ========================================

  async createCampaign(workspaceId: string, dto: CreateEmailCampaignDto): Promise<EmailCampaign> {
    const provider = this.getProvider();
    const fromEmail = dto.fromEmail || this.fromEmail;
    const fromName = dto.fromName || this.fromName;

    const campaign = await this.prisma.emailCampaign.create({
      data: {
        workspaceId,
        name: dto.name,
        subject: dto.subject,
        htmlBody: dto.htmlBody,
        fromEmail,
        fromName,
        replyTo: dto.replyTo,
        status: 'DRAFT',
        totalRecipients: dto.recipients.length,
        provider,
        recipients: {
          create: dto.recipients.map((r) => ({
            workspaceId,
            email: r.email,
            name: r.name,
            status: 'PENDING',
          })),
        },
      },
      include: { recipients: true },
    });

    this.logger.log(
      `Campaign "${campaign.name}" created with ${campaign.totalRecipients} recipients`,
    );
    return campaign;
  }

  async listCampaigns(workspaceId: string): Promise<CampaignListRow[]> {
    return this.prisma.emailCampaign.findMany({
      where: { workspaceId },
      select: {
        id: true,
        name: true,
        subject: true,
        status: true,
        totalRecipients: true,
        sentCount: true,
        deliveredCount: true,
        openedCount: true,
        clickedCount: true,
        repliedCount: true,
        failedCount: true,
        provider: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getCampaign(id: string, workspaceId: string): Promise<EmailCampaignWithRecipients | null> {
    return this.prisma.emailCampaign.findFirst({
      where: { id, workspaceId },
      include: { recipients: true },
    });
  }

  async getCampaignWithDeliveries(
    id: string,
    workspaceId: string,
  ): Promise<EmailCampaignWithDeliveries | null> {
    return this.prisma.emailCampaign.findFirst({
      where: { id, workspaceId },
      include: {
        recipients: {
          include: { deliveries: true },
        },
      },
    });
  }

  // ========================================
  // SEND FLOW
  // ========================================

  async enqueueSend(campaignId: string, workspaceId: string): Promise<EmailCampaign> {
    const campaign = await this.prisma.emailCampaign.findFirst({
      where: { id: campaignId, workspaceId },
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    if (campaign.status !== 'DRAFT') {
      throw new Error(`Cannot send campaign in status: ${campaign.status}`);
    }

    await this.prisma.emailCampaign.update({
      where: { id: campaignId },
      data: { status: 'SCHEDULED' },
    });

    if (!this.queue) {
      this.logger.warn('Queue not available — sending campaign directly');
      await this.processCampaignSend(campaignId, workspaceId);
      return this.prisma.emailCampaign.findFirstOrThrow({
        where: { id: campaignId, workspaceId },
        include: { recipients: true },
      });
    }

    await this.queue.add(campaignId, { campaignId, workspaceId }, { jobId: campaignId });
    this.logger.log(`Campaign "${campaign.name}" enqueued for sending`);

    return this.prisma.emailCampaign.findFirstOrThrow({
      where: { id: campaignId, workspaceId },
      include: { recipients: true },
    });
  }

  private async processCampaignSend(campaignId: string, workspaceId: string): Promise<void> {
    const campaign = await this.prisma.emailCampaign.findFirst({
      where: { id: campaignId, workspaceId },
      include: { recipients: true },
    });

    if (!campaign) {
      this.logger.error(`Campaign ${campaignId} not found`);
      return;
    }

    const provider = this.getProvider();

    await this.prisma.emailCampaign.update({
      where: { id: campaignId },
      data: {
        status: 'SENDING',
        startedAt: new Date(),
      },
    });

    this.logger.log(
      `Starting send for campaign "${campaign.name}" with ${campaign.recipients.length} recipients via ${provider}`,
    );

    let sentCount = 0;
    let failedCount = 0;

    for (let i = 0; i < campaign.recipients.length; i++) {
      const recipient = campaign.recipients[i];
      if (recipient.status === 'UNSUBSCRIBED') {
        continue;
      }

      try {
        const personalizedHtml = campaign.htmlBody.replace(NAME_RE, recipient.name || 'Cliente');

        const footerHtml = buildUnsubscribeFooterHtml({
          email: recipient.email,
          workspaceId,
        });
        const htmlWithUnsub = `${personalizedHtml}${footerHtml}`;

        const listUnsubscribe = buildListUnsubscribeHeader({
          email: recipient.email,
          workspaceId,
        });

        const headers: Record<string, string> = {};
        if (listUnsubscribe) {
          headers['List-Unsubscribe'] = listUnsubscribe;
          headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
        }

        const success = await this.emailService.sendEmail({
          to: recipient.email,
          subject: campaign.subject,
          html: htmlWithUnsub,
          headers,
        });

        if (success) {
          sentCount++;
          await this.recordDeliveryEvent({
            campaignId,
            recipientId: recipient.id,
            workspaceId,
            event: 'SENT',
          });
        } else {
          failedCount++;
          await this.recordDeliveryEvent({
            campaignId,
            recipientId: recipient.id,
            workspaceId,
            event: 'FAILED',
            errorMessage: 'Provider returned failure',
          });
        }

        if (i < campaign.recipients.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      } catch (err: unknown) {
        failedCount++;
        const errorMsg = err instanceof Error ? err.message : 'unknown_error';
        void this.opsAlert?.alertOnCriticalError(err, 'EmailMarketingService.processCampaignSend');
        this.logger.error(`Failed to send to ${recipient.email}: ${errorMsg}`);
        await this.recordDeliveryEvent({
          campaignId,
          recipientId: recipient.id,
          workspaceId,
          event: 'FAILED',
          errorMessage: errorMsg,
        });
      }
    }

    await this.prisma.emailCampaign.update({
      where: { id: campaignId },
      data: {
        status: 'SENT',
        sentCount,
        failedCount,
        completedAt: new Date(),
      },
    });

    this.logger.log(
      `Campaign "${campaign.name}" completed: ${sentCount} sent, ${failedCount} failed`,
    );
  }

  private async recordDeliveryEvent(log: EmailDeliveryLog): Promise<void> {
    const event = log.event;
    const statusUpdate =
      event === 'SENT'
        ? { status: 'SENT' as const, sentAt: new Date() }
        : { status: 'FAILED' as const, failedAt: new Date(), errorMessage: log.errorMessage };

    await Promise.all([
      this.prisma.emailCampaignDelivery.create({
        data: {
          campaignId: log.campaignId,
          recipientId: log.recipientId,
          workspaceId: log.workspaceId,
          event,
          providerMessageId: log.providerMessageId,
        },
      }),
      this.prisma.emailCampaignRecipient.update({
        where: { id: log.recipientId },
        data: statusUpdate,
      }),
    ]);
  }

  // ========================================
  // WEBHOOK RECONCILIATION
  // ========================================

  async reconcileDeliveryFromWebhook(params: {
    providerMessageId: string;
    event:
      | 'DELIVERED'
      | 'OPENED'
      | 'CLICKED'
      | 'REPLIED'
      | 'BOUNCED'
      | 'COMPLAINT'
      | 'UNSUBSCRIBED';
    metadata?: Record<string, unknown>;
  }): Promise<boolean> {
    const { providerMessageId, event, metadata } = params;

    const recipient = await this.prisma.emailCampaignRecipient.findFirst({
      where: { providerMessageId, workspaceId: undefined },
      include: { campaign: true },
    });

    if (!recipient) {
      this.logger.warn(`No recipient found for providerMessageId: ${providerMessageId}`);
      return false;
    }

    const campaignId = recipient.campaignId;
    const workspaceId = recipient.workspaceId;

    const statusMap: Record<
      string,
      Partial<Record<keyof EmailCampaignRecipient, Date | string | null>>
    > = {
      DELIVERED: { status: 'DELIVERED', deliveredAt: new Date() },
      OPENED: { status: 'OPENED', openedAt: new Date() },
      CLICKED: { status: 'CLICKED', clickedAt: new Date() },
      REPLIED: { status: 'REPLIED', repliedAt: new Date() },
      BOUNCED: { status: 'BOUNCED', bouncedAt: new Date() },
      UNSUBSCRIBED: { status: 'UNSUBSCRIBED', unsubscribedAt: new Date() },
    };

    const recipientUpdate = statusMap[event] || {};
    const campaignUpdate = this.buildCampaignStatUpdate(event);

    await this.prisma.emailCampaignDelivery.create({
      data: {
        campaignId,
        recipientId: recipient.id,
        workspaceId,
        event,
        providerMessageId,
        metadata: metadata ? metadata : undefined,
      },
    });

    await this.prisma.emailCampaignRecipient.update({
      where: { id: recipient.id },
      data: recipientUpdate,
    });

    if (campaignUpdate) {
      await this.prisma.emailCampaign.update({
        where: { id: campaignId },
        data: campaignUpdate,
      });
    }

    this.logger.log(`Webhook reconciled: ${event} for ${recipient.email} (campaign ${campaignId})`);
    return true;
  }

  private buildCampaignStatUpdate(
    event: string,
  ): Partial<Record<string, { increment: number }>> | null {
    switch (event) {
      case 'DELIVERED':
        return { deliveredCount: { increment: 1 } };
      case 'OPENED':
        return { openedCount: { increment: 1 } };
      case 'CLICKED':
        return { clickedCount: { increment: 1 } };
      case 'REPLIED':
        return { repliedCount: { increment: 1 } };
      case 'BOUNCED':
        return { bouncedCount: { increment: 1 } };
      case 'UNSUBSCRIBED':
        return { unsubscribedCount: { increment: 1 } };
      default:
        return null;
    }
  }
}
