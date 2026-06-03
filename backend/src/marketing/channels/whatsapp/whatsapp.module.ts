import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { BillingModule } from '../../../billing/billing.module';
import { CrmModule } from '../../../crm/crm.module';
import { InboxModule } from '../../../inbox/inbox.module';
import { OmnichannelModule } from '../../../omnichannel/omnichannel.module';
import { PrismaModule } from '../../../prisma/prisma.module';
import { WorkspaceModule } from '../../../workspaces/workspace.module';
import { WhatsAppEventEmitterModule } from '../../../kloel/whatsapp-emitter/whatsapp-event-emitter.module';
import { KloelModule } from '../../../kloel/kloel.module';
import { CiaModule } from '../../../kloel/mind/cia/cia.module';
import { CiaRuntimeService } from '../../../kloel/mind/cia/cia-runtime.service';
import { AccountAgentService } from './account-agent.service';
import { AgentEventsService } from './agent-events.service';
import { WhatsAppApiController } from './controllers/whatsapp-api.controller';
import { WhatsAppCatalogController } from './controllers/whatsapp-catalog.controller';
import { WhatsAppMetaCompatController } from './controllers/whatsapp-meta-compat.controller';
import { InboundProcessorService } from './inbound-processor.service';
import { InternalWhatsAppRuntimeController } from './controllers/internal-whatsapp-runtime.controller';
import { WhatsAppProviderRegistry } from './providers/provider-registry';
import { WhatsAppApiProvider } from './providers/whatsapp-api.provider';
import { WhatsAppCatchupService } from './whatsapp-catchup.service';
import { WhatsappCatchupOrchestratorService } from './whatsapp-catchup-orchestrator.service';
import { WhatsappCatchupHistoryService } from './whatsapp-catchup-history.service';
import { WhatsappController } from './controllers/whatsapp.controller';
import { WhatsappSendRateGuardService } from './whatsapp-send-rate-guard.service';
import { WhatsappService } from './whatsapp.service';
import { WhatsappSessionService } from './whatsapp-session.service';
import { WhatsappMessageDispatcherService } from './whatsapp-message-dispatcher.service';
import { WhatsappMediaService } from './whatsapp-media.service';
import { WhatsappReconcilerService } from './whatsapp-reconciler.service';
import { WorkerRuntimeService } from './worker-runtime.service';
import { WhatsappChatBacklogService } from './whatsapp.service.chats.backlog';
import { WhatsappChatMessagesService } from './whatsapp.service.chats.messages';
import {
  WHATSAPP_MESSAGING,
  INBOUND_PROCESSOR,
  CIA_RUNTIME,
  CATCHUP_HISTORY,
} from './whatsapp.tokens';

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
    WhatsAppProviderRegistry,
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
    {
      provide: CIA_RUNTIME,
      useExisting: CiaRuntimeService,
    },
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
