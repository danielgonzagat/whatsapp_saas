import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { BillingModule } from '../billing/billing.module';
import { CrmModule } from '../crm/crm.module';
import { InboxModule } from '../inbox/inbox.module';
import { KloelModule } from '../kloel/kloel.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { AccountAgentService } from './account-agent.service';
import { AgentEventsService } from './agent-events.service';
import { CiaRuntimeService } from './cia-runtime.service';
import { WhatsAppApiController } from './controllers/whatsapp-api.controller';
import { InboundProcessorService } from './inbound-processor.service';
import { InternalWhatsAppRuntimeController } from './internal-whatsapp-runtime.controller';
import { WhatsAppProviderRegistry } from './providers/provider-registry';
import { WahaProvider } from './providers/waha.provider';
import { WhatsAppApiProvider } from './providers/whatsapp-api.provider';
import { WhatsAppCatchupService } from './whatsapp-catchup.service';
import { WhatsAppWatchdogService } from './whatsapp-watchdog.service';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { WorkerRuntimeService } from './worker-runtime.service';

/** Whatsapp module. */
@Module({
  imports: [
    ScheduleModule.forRoot(),
    WorkspaceModule,
    InboxModule,
    ConfigModule,
    forwardRef(() => BillingModule),
    forwardRef(() => CrmModule),
    PrismaModule,
    forwardRef(() => KloelModule),
  ],
  controllers: [WhatsAppApiController, WhatsappController, InternalWhatsAppRuntimeController],
  providers: [
    WhatsappService,
    InboundProcessorService,
    WhatsAppApiProvider,
    WahaProvider,
    WhatsAppProviderRegistry,
    WhatsAppWatchdogService,
    WhatsAppCatchupService,
    AgentEventsService,
    CiaRuntimeService,
    AccountAgentService,
    WorkerRuntimeService,
  ],
  exports: [
    WhatsappService,
    InboundProcessorService,
    WhatsAppApiProvider,
    WahaProvider,
    WhatsAppProviderRegistry,
    WhatsAppWatchdogService,
    WhatsAppCatchupService,
    AgentEventsService,
    CiaRuntimeService,
    AccountAgentService,
    WorkerRuntimeService,
  ],
})
export class WhatsappModule {}
