import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { MarketingConnectController } from './marketing-connect.controller';
import { MarketingController } from './marketing.controller';
import { TikTokMarketingController } from './tiktok-marketing.controller';

/** Marketing module. */
@Module({
  imports: [PrismaModule, WhatsappModule],
  controllers: [MarketingController, MarketingConnectController, TikTokMarketingController],
})
export class MarketingModule {}
