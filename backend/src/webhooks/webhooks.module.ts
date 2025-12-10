import { Module, forwardRef } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../workspaces/workspace.service';
import { InboxModule } from '../inbox/inbox.module';

import { WebhookDispatcherService } from './webhook-dispatcher.service';
import { WebhookSettingsController } from './webhook-settings.controller';
import { WhatsAppApiWebhookController } from './whatsapp-api-webhook.controller';

@Module({
  imports: [InboxModule],
  controllers: [WebhooksController, WebhookSettingsController, WhatsAppApiWebhookController],
  providers: [
    WebhooksService,
    PrismaService,
    WorkspaceService,
    WebhookDispatcherService,
  ],
  exports: [WebhooksService, WebhookDispatcherService],
})
export class WebhooksModule {}
