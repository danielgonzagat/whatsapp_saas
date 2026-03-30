import { Global, Module } from '@nestjs/common';
import { MetaSdkService } from './meta-sdk.service';
import { MetaAuthController } from './meta-auth.controller';
import { InstagramService } from './instagram/instagram.service';
import { InstagramController } from './instagram/instagram.controller';
import { MessengerService } from './messenger/messenger.service';
import { MessengerController } from './messenger/messenger.controller';
import { MetaAdsService } from './ads/meta-ads.service';
import { MetaAdsController } from './ads/meta-ads.controller';
import { MetaWebhookController } from './webhooks/meta-webhook.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { WorkspaceGuard } from '../common/guards/workspace.guard';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [
    MetaAuthController,
    MetaWebhookController,
    InstagramController,
    MessengerController,
    MetaAdsController,
  ],
  providers: [
    MetaSdkService,
    InstagramService,
    MessengerService,
    MetaAdsService,
    WorkspaceGuard,
  ],
  exports: [
    MetaSdkService,
    InstagramService,
    MessengerService,
    MetaAdsService,
  ],
})
export class MetaModule {}
