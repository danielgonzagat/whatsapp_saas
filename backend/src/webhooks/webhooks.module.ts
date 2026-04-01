import { Module, forwardRef } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../workspaces/workspace.service';
import { InboxModule } from '../inbox/inbox.module';

import { WebhookDispatcherService } from './webhook-dispatcher.service';
import { WebhookSettingsController } from './webhook-settings.controller';
import { WhatsAppApiWebhookController } from './whatsapp-api-webhook.controller';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

// Webhook ordering: Controllers use WebhookEvent externalId unique constraint
// and checkIdempotencyOrThrow to prevent out-of-order/duplicate event processing.
@Module({
  imports: [InboxModule, forwardRef(() => WhatsappModule)],
  controllers: [
    WebhooksController,
    WebhookSettingsController,
    WhatsAppApiWebhookController,
  ],
  providers: [
    WebhooksService,
    PrismaService,
    WorkspaceService,
    WebhookDispatcherService,
  ],
  exports: [WebhooksService, WebhookDispatcherService],
})
export class WebhooksModule {}
