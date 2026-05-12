import { Module } from '@nestjs/common';
import { InboxModule } from '../inbox/inbox.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { EmailInboundController } from './email-inbound.controller';
import { MarketingConnectController } from './marketing-connect.controller';
import { MarketingController } from './marketing.controller';
import { TikTokMarketingController } from './tiktok-marketing.controller';
import { TikTokMarketingService } from './tiktok-marketing.service';
import { TikTokAdsService } from './tiktok-ads.service';
import { FacebookMessengerController } from './facebook-messenger.controller';
import { FacebookMessengerService } from './facebook-messenger.service';
import { MailboxGmailOAuthCallbackController } from './mailbox-gmail-oauth-callback.controller';
import { MailboxGmailOAuthService } from './mailbox-gmail-oauth.service';
import { MailboxImapSmtpService } from './mailbox-imap-smtp.service';
import { MailboxMicrosoftOAuthCallbackController } from './mailbox-microsoft-oauth-callback.controller';
import { MailboxMicrosoftOAuthService } from './mailbox-microsoft-oauth.service';

/** Marketing module. */
@Module({
  imports: [PrismaModule, WhatsappModule, InboxModule],
  controllers: [
    MarketingController,
    MarketingConnectController,
    MailboxGmailOAuthCallbackController,
    MailboxMicrosoftOAuthCallbackController,
    TikTokMarketingController,
    FacebookMessengerController,
  ],
  providers: [
    TikTokMarketingService,
    TikTokAdsService,
    FacebookMessengerService,
    MailboxGmailOAuthService,
    MailboxMicrosoftOAuthService,
    MailboxImapSmtpService,
  ],
  exports: [
    TikTokMarketingService,
    TikTokAdsService,
    FacebookMessengerService,
    MailboxGmailOAuthService,
    MailboxMicrosoftOAuthService,
    MailboxImapSmtpService,
  ],
})
export class MarketingModule {}
