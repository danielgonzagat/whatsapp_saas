import { Module } from '@nestjs/common';
import { InboxModule } from '../inbox/inbox.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { EmailInboundController } from './email-inbound.controller';
import { MarketingConnectController } from './marketing-connect.controller';
import { MarketingController } from './marketing.controller';
import { TikTokMarketingController } from './tiktok-marketing.controller';
import { TikTokMarketingService } from './tiktok-marketing.service';

/** Marketing module. */
@Module({
  imports: [PrismaModule, WhatsappModule, InboxModule],
  controllers: [
    MarketingController,
    MarketingConnectController,
    TikTokMarketingController,
    EmailInboundController,
  ],
  providers: [TikTokMarketingService],
})
export class MarketingModule {}
