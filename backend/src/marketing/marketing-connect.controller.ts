import { RouteClass } from '../common/throttler/route-class.decorator';
import { WebhookEndpoint } from '../common/decorators/webhook-endpoint.decorator';
import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { TikTokMarketingService } from './tiktok-marketing.service';
import { TikTokMarketingModeService, type TikTokModeResult } from './tiktok-marketing-mode.service';
import { MailboxGmailOAuthService } from './mailbox-gmail-oauth.service';
import { MailboxMicrosoftOAuthService } from './mailbox-microsoft-oauth.service';
import { MailboxImapSmtpService } from './mailbox-imap-smtp.service';
import { MetaConnectService } from './marketing-connect/meta-connect.service';
import { EmailConnectService } from './marketing-connect/email-connect.service';
import { ChannelSetupService } from './marketing-connect/channel-setup.service';
import { WhatsAppSummaryService } from './marketing-connect/whatsapp-summary.service';
import {
  type MarketingChannelSetupPayload,
  type GmailOAuthCompletePayload,
  type GmailSyncPayload,
  type GmailSendTestPayload,
  type ImapSmtpConnectPayload,
  type ConnectEmailBody,
} from './marketing-connect/shared/channel-helpers';

@Controller('marketing')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@RouteClass('mutate')
export class MarketingConnectController {
  constructor(
    private readonly metaConnect: MetaConnectService,
    private readonly emailConnect: EmailConnectService,
    private readonly channelSetup: ChannelSetupService,
    private readonly whatsappSummary: WhatsAppSummaryService,
    private readonly tiktokMarketing: TikTokMarketingService,
    private readonly tiktokMode: TikTokMarketingModeService,
    private readonly gmailMailbox: MailboxGmailOAuthService,
    private readonly microsoftMailbox: MailboxMicrosoftOAuthService,
    private readonly imapSmtpMailbox: MailboxImapSmtpService,
  ) {}

  @Get('connect/status')
  async getConnectStatus(@Request() req: { user: { workspaceId: string; email?: string } }) {
    const workspaceId = req.user.workspaceId;
    const [meta, email, tiktok] = await Promise.all([
      this.metaConnect.getStatus(workspaceId),
      this.emailConnect.getStatus(workspaceId),
      this.tiktokMarketing.getStatus(workspaceId),
    ]);
    return {
      meta: meta.meta,
      channels: {
        whatsapp: meta.whatsapp,
        instagram: meta.instagram,
        facebook: meta.facebook,
        tiktok,
        email,
      },
    };
  }

  @Get('connect/channel-setup')
  async getChannelSetup(
    @Request() req: { user: { workspaceId: string; email?: string } },
    @Query('channel') rawChannel?: string,
  ) {
    return this.channelSetup.getSetup(req.user.workspaceId, rawChannel);
  }

  @Post('connect/channel-setup')
  async saveChannelSetup(
    @Request() req: { user: { workspaceId: string; email?: string } },
    @Body() body: MarketingChannelSetupPayload = {},
  ) {
    return this.channelSetup.saveSetup(req.user.workspaceId, body);
  }

  @Post('connect/channel-setup/complete')
  async completeChannelSetup(
    @Request() req: { user: { workspaceId: string; email?: string } },
    @Body() body: MarketingChannelSetupPayload = {},
  ) {
    return this.channelSetup.completeSetup(req.user.workspaceId, body);
  }

  @Get('whatsapp/summary')
  async getWhatsAppSummary(@Request() req: { user: { workspaceId: string; email?: string } }) {
    return this.whatsappSummary.getSummary(req.user.workspaceId);
  }

  @Post('connect/email')
  async connectEmail(
    @Request() req: { user: { workspaceId: string; email?: string } },
    @Body() body: ConnectEmailBody = {},
  ) {
    const workspaceId = req.user.workspaceId;
    await this.emailConnect.connect(workspaceId, body.enabled !== false);
    return this.getConnectStatus(req);
  }

  @WebhookEndpoint('Gmail OAuth redirect initiator')
  @Get('connect/email/gmail/auth-url')
  getGmailAuthUrl(
    @Request() req: { user: { workspaceId: string; email?: string } },
    @Query('returnTo') returnTo?: string,
  ) {
    return this.gmailMailbox.buildAuthUrl(req.user.workspaceId, returnTo);
  }

  @WebhookEndpoint('Gmail OAuth callback')
  @Post('connect/email/gmail/complete')
  async completeGmailOAuth(
    @Request() req: { user: { workspaceId: string; email?: string } },
    @Body() body: GmailOAuthCompletePayload = {},
  ) {
    return this.gmailMailbox.completeOAuth(
      req.user.workspaceId,
      String(body.code || ''),
      String(body.state || ''),
    );
  }

  @WebhookEndpoint('Microsoft OAuth redirect initiator')
  @Get('connect/email/microsoft/auth-url')
  getMicrosoftAuthUrl(
    @Request() req: { user: { workspaceId: string; email?: string } },
    @Query('returnTo') returnTo?: string,
  ) {
    return this.microsoftMailbox.buildAuthUrl(req.user.workspaceId, returnTo);
  }

  @WebhookEndpoint('Microsoft OAuth callback')
  @Post('connect/email/microsoft/complete')
  async completeMicrosoftOAuth(
    @Request() req: { user: { workspaceId: string; email?: string } },
    @Body() body: GmailOAuthCompletePayload = {},
  ) {
    return this.microsoftMailbox.completeOAuth(
      req.user.workspaceId,
      String(body.code || ''),
      String(body.state || ''),
    );
  }

  @WebhookEndpoint('IMAP/SMTP mailbox connect handler')
  @Post('connect/email/imap-smtp/connect')
  async connectImapSmtpMailbox(
    @Request() req: { user: { workspaceId: string; email?: string } },
    @Body() body: ImapSmtpConnectPayload = {},
  ) {
    return this.imapSmtpMailbox.connectMailbox(req.user.workspaceId, body);
  }

  @WebhookEndpoint('Gmail mailbox sync trigger')
  @Post('connect/email/gmail/sync')
  async syncGmailMailbox(
    @Request() req: { user: { workspaceId: string; email?: string } },
    @Body() body: GmailSyncPayload = {},
  ) {
    return this.gmailMailbox.syncLatestInbox(req.user.workspaceId, Number(body.limit || 10));
  }

  @WebhookEndpoint('Gmail mailbox send-test handler')
  @Post('connect/email/gmail/send-test')
  async sendGmailMailboxTest(
    @Request() req: { user: { workspaceId: string; email?: string } },
    @Body() body: GmailSendTestPayload = {},
  ) {
    return this.gmailMailbox.sendMessageFromMailbox(req.user.workspaceId, {
      toEmail: String(body.toEmail || req.user.email || ''),
      subject: body.subject || 'Kloel CIA - Gmail conectado',
      html: body.html || '<p>Esta mensagem saiu da caixa Gmail conectada ao workspace Kloel.</p>',
      proactive: true,
    });
  }

  @Post('connect/email/test')
  async sendEmailTest(
    @Request() req: { user: { workspaceId: string; email?: string } },
    @Body() body: { toEmail?: string } = {},
  ) {
    return this.emailConnect.sendTest(
      req.user.workspaceId,
      req.user.email ?? '',
      body.toEmail,
    );
  }

  @WebhookEndpoint('Email connection status probe')
  @Get('connect/email/status')
  async getEmailStatus(@Request() req: { user: { workspaceId: string } }) {
    return this.emailConnect.getStatus(req.user.workspaceId);
  }

  @WebhookEndpoint('Email account disconnect handler')
  @Post('connect/email/disconnect')
  async disconnectEmail(@Request() req: { user: { workspaceId: string } }) {
    const workspaceId = req.user.workspaceId;
    await this.emailConnect.disconnect(workspaceId);
    return this.emailConnect.getStatus(workspaceId);
  }

  @Get('tiktok/mode')
  async getTikTokMode(@Request() req: { user: { workspaceId: string } }): Promise<TikTokModeResult> {
    const status = await this.tiktokMarketing.getStatus(req.user.workspaceId);
    const expired = status.expired === true;
    return this.tiktokMode.resolveMode(req.user.workspaceId, expired);
  }
}
