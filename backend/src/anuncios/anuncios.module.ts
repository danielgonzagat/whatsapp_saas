import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MarketingModule } from '../marketing/marketing.module';
import { MetaMarketingProvider } from '../integrations/meta-marketing.provider';
import { GoogleAdsProvider } from '../integrations/google-ads.provider';
import { TikTokAdsProvider } from '../integrations/tiktok-ads.provider';
import { AnunciosController } from './anuncios.controller';
import { AnunciosService } from './anuncios.service';

@Module({
  imports: [PrismaModule, MarketingModule],
  controllers: [AnunciosController],
  providers: [
    MetaMarketingProvider,
    GoogleAdsProvider,
    TikTokAdsProvider,
    AnunciosService,
  ],
  exports: [AnunciosService],
})
export class AnunciosModule {}
