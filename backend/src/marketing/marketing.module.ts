import { Module } from '@nestjs/common';
import { InboxModule } from '../inbox/inbox.module';
import { EmailModule } from '../email/email.module';
import { EmailCampaignService } from '../kloel/email-campaign.service';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { EmailInboundController } from './email-inbound.controller';
import { MarketingConnectController } from './marketing-connect.controller';
import { MarketingController } from './marketing.controller';
import { TikTokMarketingController } from './tiktok-marketing.controller';
import { TikTokMarketingService } from './tiktok-marketing.service';

/** Marketing module. */
@Module({
  imports: [PrismaModule, WhatsappModule, InboxModule, EmailModule],
  controllers: [
    MarketingController,
    MarketingConnectController,
    TikTokMarketingController,
    EmailInboundController,
  ],
  providers: [TikTokMarketingService, EmailCampaignService],
})
export class MarketingModule {}
