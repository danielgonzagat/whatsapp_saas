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
import { CiaBacklogRunService } from './cia-backlog-run.service';
import { CiaBootstrapService } from './cia-bootstrap.service';
import { CiaChatFilterService } from './cia-chat-filter.service';
import { CiaInlineFallbackService } from './cia-inline-fallback.service';
import { CiaRemoteBacklogService } from './cia-remote-backlog.service';
import { CiaRuntimeService } from './cia-runtime.service';
import { CiaRuntimeStateService } from './cia-runtime-state.service';
import { CiaSendHelpersService } from './cia-send-helpers.service';
import { WhatsAppApiController } from './controllers/whatsapp-api.controller';
import { WhatsAppCatalogController } from './controllers/whatsapp-catalog.controller';
import { WhatsAppMetaCompatController } from './controllers/whatsapp-meta-compat.controller';
import { InboundProcessorService } from './inbound-processor.service';
import { InternalWhatsAppRuntimeController } from './internal-whatsapp-runtime.controller';
import { WhatsAppProviderRegistry } from './providers/provider-registry';
import { WahaProvider } from './providers/waha.provider';
import { WhatsAppApiProvider } from './providers/whatsapp-api.provider';
import { WhatsAppCatchupService } from './whatsapp-catchup.service';
import { WhatsappCatchupOrchestratorService } from './whatsapp-catchup-orchestrator.service';
import { WhatsappCatchupHistoryService } from './whatsapp-catchup-history.service';
import { WhatsAppWatchdogService } from './whatsapp-watchdog.service';
import { WhatsAppWatchdogRecoveryService } from './whatsapp-watchdog-recovery.service';
import { WhatsAppWatchdogSessionService } from './whatsapp-watchdog-session.service';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappSendRateGuardService } from './whatsapp-send-rate-guard.service';
import { WhatsappService } from './whatsapp.service';
import { WhatsappSessionService } from './whatsapp-session.service';
import { WhatsappMessageDispatcherService } from './whatsapp-message-dispatcher.service';
import { WhatsappMediaService } from './whatsapp-media.service';
import { WhatsappReconcilerService } from './whatsapp-reconciler.service';
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
    CiaChatFilterService,
    CiaRuntimeService,
    CiaRuntimeStateService,
    CiaBootstrapService,
    CiaBacklogRunService,
    CiaInlineFallbackService,
    CiaRemoteBacklogService,
    CiaSendHelpersService,
    AccountAgentService,
    WorkerRuntimeService,
  ],
  exports: [
    WhatsappService,
    WhatsappSessionService,
    WhatsappMessageDispatcherService,
    WhatsappMediaService,
    WhatsappReconcilerService,
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
    CiaChatFilterService,
    CiaRuntimeService,
    CiaRuntimeStateService,
    CiaBootstrapService,
    CiaBacklogRunService,
    CiaInlineFallbackService,
    CiaRemoteBacklogService,
    CiaSendHelpersService,
    AccountAgentService,
    WorkerRuntimeService,
  ],
})
export class WhatsappModule {}
