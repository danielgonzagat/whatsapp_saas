import { Module, forwardRef } from '@nestjs/common';
import { InboxModule } from '../inbox/inbox.module';
import { KloelModule } from '../kloel/kloel.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { MarketingConnectController } from './marketing-connect.controller';
import { MarketingController } from './marketing.controller';
import { TikTokMarketingController } from './tiktok-marketing.controller';
import { TikTokMarketingService } from './tiktok-marketing.service';
import { TikTokMarketingModeService } from './tiktok-marketing-mode.service';
import { TikTokAdsService } from './tiktok-ads.service';
import { FacebookMessengerController } from './facebook-messenger.controller';
import { FacebookMessengerService } from './facebook-messenger.service';
import { MailboxGmailOAuthCallbackController } from './mailbox-gmail-oauth-callback.controller';
import { MailboxGmailOAuthService } from './mailbox-gmail-oauth.service';
import { GmailClientService } from './mailbox-gmail-oauth/gmail-client.service';
import { GmailOAuthHandshakeService } from './mailbox-gmail-oauth/oauth-handshake.service';
import { GmailSyncService } from './mailbox-gmail-oauth/sync.service';
import { GmailSendService } from './mailbox-gmail-oauth/send.service';
import { GMAIL_OAUTH_TOKEN } from './tokens';
import { MailboxImapSmtpService } from './mailbox-imap-smtp.service';
import { MailboxMicrosoftOAuthCallbackController } from './mailbox-microsoft-oauth-callback.controller';
import { MailboxMicrosoftOAuthService } from './mailbox-microsoft-oauth.service';
import { MetaConnectService } from './marketing-connect/meta-connect.service';
import { EmailConnectService } from './marketing-connect/email-connect.service';
import { ChannelSetupService } from './marketing-connect/channel-setup.service';
import { WhatsAppSummaryService } from './marketing-connect/whatsapp-summary.service';
import { GoogleAdsMarketingController } from './google-ads-marketing.controller';
import { GoogleAdsMarketingService } from './google-ads-marketing.service';

/** Marketing module. */
@Module({
  imports: [PrismaModule, WhatsappModule, InboxModule, forwardRef(() => KloelModule)],
  controllers: [
    MarketingController,
    MarketingConnectController,
    MailboxGmailOAuthCallbackController,
    MailboxMicrosoftOAuthCallbackController,
    TikTokMarketingController,
    GoogleAdsMarketingController,
    FacebookMessengerController,
  ],
  providers: [
    TikTokMarketingService,
    TikTokMarketingModeService,
    TikTokAdsService,
    GoogleAdsMarketingService,
    FacebookMessengerService,
    GmailClientService,
    GmailOAuthHandshakeService,
    GmailSyncService,
    GmailSendService,
    MailboxGmailOAuthService,
    { provide: GMAIL_OAUTH_TOKEN, useExisting: MailboxGmailOAuthService },
    MailboxMicrosoftOAuthService,
    MailboxImapSmtpService,
    MetaConnectService,
    EmailConnectService,
    ChannelSetupService,
    WhatsAppSummaryService,
  ],
  exports: [
    TikTokMarketingService,
    TikTokMarketingModeService,
    TikTokAdsService,
    GoogleAdsMarketingService,
    FacebookMessengerService,
    MailboxGmailOAuthService,
    MailboxMicrosoftOAuthService,
    MailboxImapSmtpService,
    MetaConnectService,
    EmailConnectService,
    ChannelSetupService,
    WhatsAppSummaryService,
  ],
})
export class MarketingModule {}
