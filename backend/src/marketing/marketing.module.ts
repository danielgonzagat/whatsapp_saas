import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { MarketingConnectController } from './marketing-connect.controller';
import { MarketingController } from './marketing.controller';
import { TikTokMarketingController } from './tiktok-marketing.controller';
import { TikTokMarketingService } from './tiktok-marketing.service';
import { FacebookMessengerController } from './facebook-messenger.controller';
import { FacebookMessengerService } from './facebook-messenger.service';

/** Marketing module. */
@Module({
  imports: [PrismaModule, WhatsappModule],
  controllers: [
    MarketingController,
    MarketingConnectController,
    TikTokMarketingController,
    FacebookMessengerController,
  ],
  providers: [TikTokMarketingService, FacebookMessengerService],
  exports: [FacebookMessengerService],
})
export class MarketingModule {}
