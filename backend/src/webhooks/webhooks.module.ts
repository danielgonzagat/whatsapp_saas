import { Module, forwardRef } from '@nestjs/common';
import { InboxModule } from '../inbox/inbox.module';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../workspaces/workspace.service';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { WebhookDispatcherService } from './webhook-dispatcher.service';
import { WebhookSettingsController } from './webhook-settings.controller';
import { TikTokWebhookController } from './tiktok-webhook.controller';
import { WhatsAppApiWebhookController } from './whatsapp-api-webhook.controller';

// Webhook ordering: Controllers use WebhookEvent externalId unique constraint
// and checkIdempotencyOrThrow to prevent out-of-order/duplicate event processing.
@Module({
  imports: [InboxModule, forwardRef(() => WhatsappModule)],
  controllers: [
    WebhooksController,
    WebhookSettingsController,
    WhatsAppApiWebhookController,
    TikTokWebhookController,
  ],
  providers: [WebhooksService, PrismaService, WorkspaceService, WebhookDispatcherService],
  exports: [WebhooksService, WebhookDispatcherService],
})
export class WebhooksModule {}
