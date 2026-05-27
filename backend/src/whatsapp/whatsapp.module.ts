import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { BillingModule } from '../billing/billing.module';
import { CrmModule } from '../crm/crm.module';
import { InboxModule } from '../inbox/inbox.module';
import { OmnichannelModule } from '../omnichannel/omnichannel.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { WhatsAppEventEmitterModule } from '../kloel/whatsapp-emitter/whatsapp-event-emitter.module';

const { KloelModule } = require('../kloel/kloel.module');
import { AccountAgentService } from './account-agent.service';
import { AgentEventsService } from '../marketing/channels/whatsapp/agent-events.service';
import { WhatsAppApiController } from '../marketing/channels/whatsapp/controllers/whatsapp-api.controller';
import { WhatsAppCatalogController } from '../marketing/channels/whatsapp/controllers/whatsapp-catalog.controller';
import { WhatsAppMetaCompatController } from '../marketing/channels/whatsapp/controllers/whatsapp-meta-compat.controller';
import { InboundProcessorService } from '../marketing/channels/whatsapp/inbound-processor.service';
import { InternalWhatsAppRuntimeController } from '../marketing/channels/whatsapp/controllers/internal-whatsapp-runtime.controller';
import { WhatsAppProviderRegistry } from './providers/provider-registry';
import { WahaProvider } from '../marketing/channels/whatsapp/providers/waha.provider';
import { WhatsAppApiProvider } from '../marketing/channels/whatsapp/providers/whatsapp-api.provider';
import { WhatsAppCatchupService } from './whatsapp-catchup.service';
import { WhatsappCatchupOrchestratorService } from './whatsapp-catchup-orchestrator.service';
import { WhatsappCatchupHistoryService } from '../marketing/channels/whatsapp/whatsapp-catchup-history.service';
import { WhatsAppWatchdogService } from '../marketing/channels/whatsapp/whatsapp-watchdog.service';
import { WhatsAppWatchdogRecoveryService } from '../marketing/channels/whatsapp/whatsapp-watchdog-recovery.service';
import { WhatsAppWatchdogSessionService } from '../marketing/channels/whatsapp/whatsapp-watchdog-session.service';
import { WhatsappController } from '../marketing/channels/whatsapp/controllers/whatsapp.controller';
import { WhatsappSendRateGuardService } from '../marketing/channels/whatsapp/whatsapp-send-rate-guard.service';
import { WhatsappService } from './whatsapp.service';
import { WhatsappSessionService } from '../marketing/channels/whatsapp/whatsapp-session.service';
import { WhatsappMessageDispatcherService } from '../marketing/channels/whatsapp/whatsapp-message-dispatcher.service';
import { WhatsappMediaService } from '../marketing/channels/whatsapp/whatsapp-media.service';
import { WhatsappReconcilerService } from '../marketing/channels/whatsapp/whatsapp-reconciler.service';
import { WorkerRuntimeService } from './worker-runtime.service';
import { WhatsappChatBacklogService } from '../marketing/channels/whatsapp/whatsapp.service.chats.backlog';
import { WhatsappChatMessagesService } from '../marketing/channels/whatsapp/whatsapp.service.chats.messages';
import {
  WHATSAPP_MESSAGING,
  INBOUND_PROCESSOR,
  CIA_RUNTIME,
  CATCHUP_HISTORY,
} from '../marketing/channels/whatsapp/whatsapp.tokens';

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
    forwardRef(() => require('../kloel/mind/cia/cia.module').CiaModule),
    forwardRef(() => OmnichannelModule),
    WhatsAppEventEmitterModule,
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
    WhatsappSessionService,
    WhatsappMessageDispatcherService,
    WhatsappMediaService,
    WhatsappReconcilerService,
    WhatsappSendRateGuardService,
    InboundProcessorService,
    WhatsAppApiProvider,
    WahaProvider,
    WhatsAppProviderRegistry,
    WhatsAppWatchdogService,
    WhatsAppWatchdogRecoveryService,
    WhatsAppWatchdogSessionService,
    WhatsAppCatchupService,
    WhatsappCatchupOrchestratorService,
    WhatsappCatchupHistoryService,
    AgentEventsService,
    AccountAgentService,
    WorkerRuntimeService,
    WhatsappChatMessagesService,
    WhatsappChatBacklogService,
    { provide: WHATSAPP_MESSAGING, useExisting: WhatsappService },
    { provide: INBOUND_PROCESSOR, useExisting: InboundProcessorService },
    { provide: CIA_RUNTIME, useExisting: require('../cia/cia-runtime.service').CiaRuntimeService },
    { provide: CATCHUP_HISTORY, useExisting: WhatsappCatchupHistoryService },
  ],
  exports: [
    WhatsappService,
    WHATSAPP_MESSAGING,
    InboundProcessorService,
    INBOUND_PROCESSOR,
    CIA_RUNTIME,
    WhatsappCatchupHistoryService,
    WhatsAppCatchupService,
    CATCHUP_HISTORY,
    AgentEventsService,
    AccountAgentService,
    WorkerRuntimeService,
    WhatsAppApiProvider,
    WhatsAppProviderRegistry,
  ],
})
export class WhatsappModule {}
