import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { EmailMarketingController } from './email-marketing.controller';
import { EmailMarketingWebhookController } from './email-marketing-webhook.controller';
import { EmailMarketingService } from './email-marketing.service';
import { MarketingConnectController } from './marketing-connect.controller';
import { MarketingController } from './marketing.controller';
import { TikTokMarketingController } from './tiktok-marketing.controller';
import { TikTokMarketingService } from './tiktok-marketing.service';

/** Marketing module. */
@Module({
  imports: [PrismaModule, WhatsappModule, AuthModule],
  controllers: [
    MarketingController,
    MarketingConnectController,
    TikTokMarketingController,
    EmailMarketingController,
    EmailMarketingWebhookController,
  ],
  providers: [TikTokMarketingService, EmailMarketingService],
  exports: [EmailMarketingService],
})
export class MarketingModule {}
