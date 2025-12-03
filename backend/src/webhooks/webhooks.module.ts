import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../workspaces/workspace.service';
import { InboxModule } from '../inbox/inbox.module';

import { WebhookDispatcherService } from './webhook-dispatcher.service';
import { WebhookSettingsController } from './webhook-settings.controller';

@Module({
  imports: [InboxModule],
  controllers: [WebhooksController, WebhookSettingsController],
  providers: [
    WebhooksService,
    PrismaService,
    WorkspaceService,
    WebhookDispatcherService,
  ],
  exports: [WebhooksService, WebhookDispatcherService],
})
export class WebhooksModule {}
