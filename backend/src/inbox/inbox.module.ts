import { Module, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { getJwtSecret } from '../auth/jwt-config';
import { KloelModule } from '../kloel/kloel.module';
import { ContactsModule } from '../contacts/contacts.module';
import { OmnichannelModule } from '../omnichannel/omnichannel.module';
import { WebhookDispatcherService } from '../webhooks/webhook-dispatcher.service';
import { InboxEventsService } from './inbox-events.service';
import { InboxController } from './inbox.controller';
import { InboxGateway } from './inbox.gateway';
import { InboxService } from './inbox.service';
import { OmnichannelService } from './omnichannel.service';
import { SmartRoutingService } from './smart-routing.service';

/** Inbox module. */
@Module({
  imports: [
    forwardRef(() => KloelModule),
    ContactsModule,
    OmnichannelModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: String(config.get<string>('JWT_SECRET') || getJwtSecret()).trim(),
      }),
    }),
    // WebhookDispatcherService is provided directly (not via module import to avoid circular deps)
  ],
  controllers: [InboxController],
  providers: [
    InboxService,
    InboxGateway,
    SmartRoutingService,
    OmnichannelService,
    WebhookDispatcherService,
    InboxEventsService,
  ],
  exports: [InboxService, InboxGateway, SmartRoutingService, OmnichannelService],
})
export class InboxModule {}
