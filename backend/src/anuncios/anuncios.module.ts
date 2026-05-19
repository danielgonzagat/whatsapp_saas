import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MarketingModule } from '../marketing/marketing.module';
import { TikTokAdsModule } from '../tiktok-ads/tiktok-ads.module';
import { MetaMarketingProvider } from '../integrations/meta-marketing.provider';
import { GoogleAdsProvider } from '../integrations/google-ads.provider';
import { AdsSyncProcessor } from '../integrations/ads-sync.processor';
import { MetaConversionsApiService } from '../integrations/meta-conversions-api.service';
import { AnunciosController } from './anuncios.controller';
import { AnunciosService } from './anuncios.service';

@Module({
  imports: [PrismaModule, MarketingModule, TikTokAdsModule],
  controllers: [AnunciosController],
  providers: [
    MetaMarketingProvider,
    GoogleAdsProvider,
    AnunciosService,
    AdsSyncProcessor,
    MetaConversionsApiService,
  ],
  exports: [AnunciosService, MetaConversionsApiService],
})
export class AnunciosModule {}
