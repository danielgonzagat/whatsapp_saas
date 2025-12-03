import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { InboxService } from './inbox.service';
import { InboxController } from './inbox.controller';
import { InboxGateway } from './inbox.gateway';
import { SmartRoutingService } from './smart-routing.service';
import { WebhookDispatcherService } from '../webhooks/webhook-dispatcher.service';
import { InboxEventsService } from './inbox-events.service';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev-secret',
    }),
    // We need to import WebhooksModule to use WebhookDispatcherService,
    // but to avoid circular dependency (if any), we might just provide it or import the module.
    // Let's assume WebhooksModule is global or we import it.
  ],
  controllers: [InboxController],
  providers: [
    InboxService,
    InboxGateway,
    SmartRoutingService,
    WebhookDispatcherService,
    InboxEventsService,
  ],
  exports: [InboxService, InboxGateway, SmartRoutingService],
})
export class InboxModule {}
