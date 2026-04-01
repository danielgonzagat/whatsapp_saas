import { Global, Module, forwardRef } from '@nestjs/common';
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
import { MetaWhatsAppService } from './meta-whatsapp.service';
import { InboxModule } from '../inbox/inbox.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Global()
@Module({
  imports: [PrismaModule, InboxModule, forwardRef(() => WhatsappModule)],
  controllers: [
    MetaAuthController,
    MetaWebhookController,
    InstagramController,
    MessengerController,
    MetaAdsController,
  ],
  providers: [
    MetaSdkService,
    MetaWhatsAppService,
    InstagramService,
    MessengerService,
    MetaAdsService,
    WorkspaceGuard,
  ],
  exports: [
    MetaSdkService,
    MetaWhatsAppService,
    InstagramService,
    MessengerService,
    MetaAdsService,
  ],
})
export class MetaModule {}
