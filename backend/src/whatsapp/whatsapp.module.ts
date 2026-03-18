import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { WhatsappService } from './whatsapp.service';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { InboxModule } from '../inbox/inbox.module';
import { ConfigModule } from '@nestjs/config';
import { BillingModule } from '../billing/billing.module';
import { CrmModule } from '../crm/crm.module';
import { InboundProcessorService } from './inbound-processor.service';
import { WhatsAppApiProvider } from './providers/whatsapp-api.provider';
import { WhatsAppProviderRegistry } from './providers/provider-registry';
import { WhatsAppApiController } from './controllers/whatsapp-api.controller';
import { WhatsappController } from './whatsapp.controller';
import { WhatsAppWatchdogService } from './whatsapp-watchdog.service';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsAppCatchupService } from './whatsapp-catchup.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    WorkspaceModule,
    InboxModule,
    ConfigModule,
    BillingModule,
    CrmModule,
    PrismaModule,
  ],
  controllers: [WhatsAppApiController, WhatsappController],
  providers: [
    WhatsappService,
    InboundProcessorService,
    WhatsAppApiProvider,
    WhatsAppProviderRegistry,
    WhatsAppWatchdogService,
    WhatsAppCatchupService,
  ],
  exports: [
    WhatsappService,
    InboundProcessorService,
    WhatsAppApiProvider,
    WhatsAppProviderRegistry,
    WhatsAppWatchdogService,
    WhatsAppCatchupService,
  ],
})
export class WhatsappModule {}
