import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { CiaModule } from '../cia/cia.module';
import { BillingModule } from '../billing/billing.module';
import { CrmModule } from '../crm/crm.module';
import { InboxModule } from '../inbox/inbox.module';
import { KloelModule } from '../kloel/kloel.module';
import { OmnichannelModule } from '../omnichannel/omnichannel.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { AccountAgentService } from './account-agent.service';
import { AgentEventsService } from './agent-events.service';
import { WhatsAppApiController } from './controllers/whatsapp-api.controller';
import { WhatsAppCatalogController } from './controllers/whatsapp-catalog.controller';
import { WhatsAppMetaCompatController } from './controllers/whatsapp-meta-compat.controller';
import { InboundProcessorService } from './inbound-processor.service';
import { InternalWhatsAppRuntimeController } from './internal-whatsapp-runtime.controller';
import { WhatsAppProviderRegistry } from './providers/provider-registry';
import { WahaProvider } from './providers/waha.provider';
import { WhatsAppApiProvider } from './providers/whatsapp-api.provider';
import { WhatsAppCatchupService } from './whatsapp-catchup.service';
import { WhatsAppWatchdogService } from './whatsapp-watchdog.service';
import { WhatsAppWatchdogRecoveryService } from './whatsapp-watchdog-recovery.service';
import { WhatsAppWatchdogSessionService } from './whatsapp-watchdog-session.service';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappSendRateGuardService } from './whatsapp-send-rate-guard.service';
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
    forwardRef(() => CiaModule),
    forwardRef(() => OmnichannelModule),
  ],
  controllers: [
    WhatsAppApiController,
    WhatsAppCatalogController,
    WhatsAppMetaCompatController,
    WhatsappController,
    InternalWhatsAppRuntimeController,
  ],
  providers: [
    WhatsappService,
    WhatsappSendRateGuardService,
    InboundProcessorService,
    WhatsAppApiProvider,
    WahaProvider,
    WhatsAppProviderRegistry,
    WhatsAppWatchdogService,
    WhatsAppWatchdogRecoveryService,
    WhatsAppWatchdogSessionService,
    WhatsAppCatchupService,
    AgentEventsService,
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
    WhatsAppWatchdogRecoveryService,
    WhatsAppWatchdogSessionService,
    WhatsAppCatchupService,
    AgentEventsService,
    AccountAgentService,
    WorkerRuntimeService,
  ],
})
export class WhatsappModule {}
