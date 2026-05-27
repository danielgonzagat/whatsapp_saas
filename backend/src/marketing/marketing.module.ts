import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { MarketingConnectController } from './marketing-connect.controller';
import { GoogleAdsMarketingController } from './google-ads-marketing.controller';
import { GoogleAdsMarketingService } from './google-ads-marketing.service';
import { MarketingController } from './marketing.controller';
import { TikTokMarketingController } from './tiktok-marketing.controller';
import { TikTokMarketingService } from './tiktok-marketing.service';

/** Marketing module. */
@Module({
  imports: [PrismaModule, WhatsappModule],
  controllers: [
    MarketingController,
    MarketingConnectController,
    TikTokMarketingController,
    GoogleAdsMarketingController,
  ],
  providers: [TikTokMarketingService, GoogleAdsMarketingService],
})
export class MarketingModule {}
