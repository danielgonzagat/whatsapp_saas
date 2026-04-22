import { Global, Module, forwardRef } from '@nestjs/common';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { InboxModule } from '../inbox/inbox.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { MetaAdsController } from './ads/meta-ads.controller';
import { MetaAdsService } from './ads/meta-ads.service';
import { InstagramController } from './instagram/instagram.controller';
import { InstagramService } from './instagram/instagram.service';
import { MessengerController } from './messenger/messenger.controller';
import { MessengerService } from './messenger/messenger.service';
import { MetaAuthController } from './meta-auth.controller';
import { MetaSdkService } from './meta-sdk.service';
import { MetaWhatsAppService } from './meta-whatsapp.service';
import { MetaLeadgenService } from './webhooks/meta-leadgen.service';
import { MetaWebhookController } from './webhooks/meta-webhook.controller';

// Webhook ordering: MetaWebhookController processes events with createdAt
// timestamps from Meta Graph API; duplicate entries skipped by externalId.
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
    MetaLeadgenService,
    WorkspaceGuard,
  ],
  exports: [
    MetaSdkService,
    MetaWhatsAppService,
    InstagramService,
    MessengerService,
    MetaAdsService,
    MetaLeadgenService,
  ],
})
export class MetaModule {}
