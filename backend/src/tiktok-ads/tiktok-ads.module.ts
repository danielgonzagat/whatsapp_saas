import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MarketingModule } from '../marketing/marketing.module';
import { TikTokAdsProvider } from '../integrations/tiktok-ads.provider';
import { TikTokEventsApiService } from '../integrations/tiktok-events-api.service';
import { TikTokAuthController } from './tiktok-auth.controller';

@Module({
  imports: [PrismaModule, MarketingModule],
  controllers: [TikTokAuthController],
  providers: [TikTokAdsProvider, TikTokEventsApiService],
  exports: [TikTokAdsProvider, TikTokEventsApiService],
})
export class TikTokAdsModule {}
