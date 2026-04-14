import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { WhatsappService } from './whatsapp.service';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { InboxModule } from '../inbox/inbox.module';
import { ConfigModule } from '@nestjs/config';
import { BillingModule } from '../billing/billing.module';
import { CrmModule } from '../crm/crm.module';
import { InboundProcessorService } from './inbound-processor.service';
import { WhatsAppApiProvider } from './providers/whatsapp-api.provider';
import { WahaProvider } from './providers/waha.provider';
import { WhatsAppProviderRegistry } from './providers/provider-registry';
import { WhatsAppApiController } from './controllers/whatsapp-api.controller';
import { WhatsappController } from './whatsapp.controller';
import { WhatsAppWatchdogService } from './whatsapp-watchdog.service';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsAppCatchupService } from './whatsapp-catchup.service';
import { AgentEventsService } from './agent-events.service';
import { CiaRuntimeService } from './cia-runtime.service';
import { AccountAgentService } from './account-agent.service';
import { WorkerRuntimeService } from './worker-runtime.service';
import { KloelModule } from '../kloel/kloel.module';
import { InternalWhatsAppRuntimeController } from './internal-whatsapp-runtime.controller';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    WorkspaceModule,
    InboxModule,
    ConfigModule,
    BillingModule,
    CrmModule,
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
