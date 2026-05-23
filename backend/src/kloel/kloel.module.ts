import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConversationalOnboardingService } from './conversational-onboarding.service';
import { ConversationalOnboardingToolsService } from './conversational-onboarding-tools.service';
import { KloelToolExecutorBillingService } from './kloel-tool-executor-billing.service';
import { KloelToolExecutorWhatsAppService } from './kloel-tool-executor-whatsapp.service';
import { KloelWorkspaceContextLinkedProductService } from './kloel-workspace-context-linked-product.service';
import { KloelWorkspaceContextDataService } from './kloel-workspace-context-data.service';
import { KloelToolExecutorCrmService } from './kloel-tool-executor-crm.service';
import { GuestChatController } from './guest-chat.controller';
import { GuestChatService } from './guest-chat.service';
import { KloelCodeToolsService } from './kloel-code-tools.service';
import { KloelCodeAnalysisService } from './kloel-code-analysis.service';

import { KloelReflexivityService } from './kloel-reflexivity.service';
import { UnifiedAgentToolExecutorService } from './unified-agent-tool-executor';

import { KloelBusinessConfigToolsService } from './kloel-business-config-tools.service';
import { KloelChatToolsService } from './kloel-chat-tools.service';
import { KloelComposerService } from './kloel-composer.service';
import { KLOEL_COMPOSER_E2E_GUARD, NoopKloelComposerE2EGuard } from './kloel-composer-e2e-guard';
import { KLOEL_LLM_E2E_GUARD, NoopKloelLLME2EGuard } from './kloel-llm-e2e-guard';
import { KloelController } from './kloel.controller';
import { KloelDataController } from './kloel-data.controller';
import { KloelLeadBrainService } from './kloel-lead-brain.service';
import { KloelLeadProcessorService } from './kloel-lead-processor.service';
import { KloelReplyEngineService } from './kloel-reply-engine.service';
import { KloelService } from './kloel.service';
import { KloelThreadSearchService } from './kloel-thread-search.service';
import { KloelThreadService } from './kloel-thread.service';
import { KloelThreadSummaryService } from './kloel-thread-summary.service';
import { KloelThinkerService } from './kloel-thinker.service';
import { KloelToolDispatcherService } from './kloel-tool-dispatcher.service';
import { KloelToolExecutorService } from './kloel-tool-executor.service';
import { KloelWhatsAppToolsService } from './kloel-whatsapp-tools.service';
import { KloelWorkspaceContextService } from './kloel-workspace-context.service';
import { OnboardingProfileController } from './onboarding-profile.controller';
import { OnboardingService } from './onboarding.service';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { WhatsAppBrainController } from './whatsapp-brain.controller';
import { WhatsAppBrainService } from './whatsapp-brain.service';

import { LLMBudgetService } from './llm-budget.service';
import { MemoryManagementService } from './memory-management.service';
import { MemoryController } from './memory.controller';
import { MemoryCrudService } from './memory-crud.service';
import { MemorySearchService } from './memory-search.service';
import { MemoryService } from './memory.service';
import { MarketingSkillContextBuilder } from './marketing-skills/marketing-skill.context';
import { MarketingSkillLoader } from './marketing-skills/marketing-skill.loader';
import { MarketingSkillRouter } from './marketing-skills/marketing-skill.router';
import { MarketingSkillService } from './marketing-skills/marketing-skill.service';
import { PdfProcessorController } from './pdf-processor.controller';
import { PdfProcessorService } from './pdf-processor.service';
import { WalletLedgerService } from './wallet-ledger.service';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

import { AuditModule } from '../audit/audit.module';
import { BillingModule } from '../billing/billing.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { KycModule } from '../kyc/kyc.module';
import { FraudModule } from '../payments/fraud/fraud.module';
import { MetricsModule } from '../metrics/metrics.module';
import { PartnershipsModule } from '../partnerships/partnerships.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PulseArtifactService } from '../pulse/pulse-artifact.service';
import { WalletModule } from '../wallet/wallet.module';
import { ContactsModule } from '../contacts/contacts.module';
import { ContactIdentityResolverService } from '../contacts/contact-identity-resolver.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { WebhookDispatcherService } from '../webhooks/webhook-dispatcher.service';
import { AdRulesEngineService } from './ad-rules-engine.service';
import { AdRulesController } from './ad-rules.controller';
import { CanvasController } from './canvas.controller';
import { CartRecoveryService } from './cart-recovery.service';
import { DiagnosticsController } from './diagnostics.controller';
import { EmailCampaignService } from './email-campaign.service';
import { KloelAudioModule } from './kloel-audio.module';
import { KloelRulesModule } from './rules/kloel-rules.module';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { OrderAlertsService } from './order-alerts.service';
import {
  ProductAIConfigController,
  ProductAffiliateController,
  ProductCampaignController,
  ProductCheckoutController,
  ProductCommissionController,
  ProductCouponController,
  ProductPlanController,
  ProductReviewController,
  ProductUrlController,
} from './product-sub-resources.controller';
import { ProductController } from './product.controller';
import { SalesController } from './sales.controller';
import { SalesOrdersController } from './sales-orders.controller';
import { SalesSubscriptionsController } from './sales-subscriptions.controller';
import { SitePublicController } from './site-public.controller';
import { SiteController } from './site.controller';
import { SmartPaymentController } from './smart-payment.controller';
import { SmartPaymentService } from './smart-payment.service';
import { UnifiedAgentActionsBillingService } from './unified-agent-actions-billing.service';
import { UnifiedAgentActionsCommerceService } from './unified-agent-actions-commerce.service';
import { UnifiedAgentActionsCrmService } from './unified-agent-actions-crm.service';
import { UnifiedAgentActionsMessagingService } from './unified-agent-actions-messaging.service';
import { UnifiedAgentActionsSalesService } from './unified-agent-actions-sales.service';
import { UnifiedAgentActionsService } from './unified-agent-actions.service';
import { UnifiedAgentActionsWorkspaceService } from './unified-agent-actions-workspace.service';
import { UnifiedAgentContextDataService } from './unified-agent-context-data.service';
import { UnifiedAgentContextService } from './unified-agent-context.service';
import { UnifiedAgentResponseService } from './unified-agent-response.service';
import { UnifiedAgentController } from './unified-agent.controller';
import { UnifiedAgentService } from './unified-agent.service';
import { UNIFIED_AGENT_TOKEN } from './tokens';
import { UploadController } from './upload.controller';
import { WebinarController } from './webinar.controller';
import { BrainCapabilityRegistryService } from './brain-capability-registry.service';
import { BrainCapabilityExecutorService } from './brain-capability-executor.service';
import { BrainAutonomyService } from './brain-autonomy.service';
import { LacunasController } from './lacunas.controller';
import { BrainCommercialGraphService } from './brain-commercial-graph.service';
import { BrainEventSpineService } from './brain-event-spine.service';
import { BrainRuntimeController } from './brain-runtime.controller';
import { BrainRuntimeService } from './brain-runtime.service';
import {
  EmailChannelTransport,
  InstagramChannelTransport,
  MessengerChannelTransport,
  TikTokChannelTransport,
  WhatsAppChannelTransport,
} from './channel-transport.providers';
import { ChannelTransportRegistry } from './channel-transport.registry';
import { ChannelSetupController } from './channel-setup.controller';
import { ChannelSetupService } from './channel-setup.service';
import { CommercialDecisionOrchestratorService } from './commercial-decision-orchestrator.service';
import { RuntimeConversationTracerService } from './runtime-conversation-tracer.service';
import { DailyLimitService } from './daily-limit.service';
import { KloelGlobalPriorService } from './kloel-global-prior.service';
import { MindBeliefService } from './mind-belief.service';
import { MindBanditService } from './mind-bandit.service';
import { MindCaseMemoryService } from './mind-case-memory.service';
import { MindConceptService } from './mind-concepts.service';
import { MindGlobalPriorService } from './mind-global-prior.service';
import { MindController } from './mind-controller';
import { MindEventProcessorService } from './mind-event-processor.service';
import { MindGuardContextBuilderService } from './mind-guard-context-builder.service';
import { MindGuardsService } from './mind-guards.service';
import { MindObservabilityService } from './mind-observability.service';
import { MindPerceptionService } from './mind-perception.service';
import { MindPolicyService } from './mind-policy.service';
import { MindPredictorService } from './mind-predictor.service';
import { MindProcessorService } from './mind-processor.service';
import { MindQualityService } from './mind-quality.service';
import { MindReportService } from './mind-report.service';
import { MindReplayService } from './mind-replay.service';
import { MindSimulatorService } from './mind-simulator.service';
import { MindSyntheticGeneratorService } from './mind-synthetic-generator.service';
import { MindService } from './mind.service';
import { DecisionOutcomeService } from './decision-outcome.service';
import { DriftModule } from './drift/drift.module';
import { MindLiftReportService } from './mind-lift-report.service';
import { MindSurpriseService } from './mind-surprise.service';
import { MindVerbalizerService } from './mind-verbalizer.service';
import { MindWorkspaceStateService } from './mind-workspace-state.service';
import { AgentRuntimeJobRunnerService } from './agent-runtime/agent-runtime.job-runner';
import {
  AgentRuntimeContextService,
  AgentRuntimeContextCompressorService,
  AgentRuntimeBuiltinMemoryProvider,
  AgentRuntimeEvidenceStoreService,
  AgentRuntimeMemoryCuratorService,
  AgentRuntimeMemoryManagerService,
  AgentRuntimePolicyService,
  AgentRuntimePulseSelfModelService,
  AgentRuntimeSchedulerService,
  AgentRuntimeSessionStore,
  AgentRuntimeSkillRegistry,
} from './agent-runtime';
import { AbiBuilderService } from './abi/abi-builder.service';
import { LineageModule } from './lineage/lineage.module';
import { RiskClassModule } from './risk-class/risk-class.module';
import { KloelProductSubResourceToolsService } from './kloel-product-sub-resource-tools.service';
import { KloelWalletSalesToolsService } from './kloel-wallet-sales-tools.service';

/** Kloel module. */
@Module({
  imports: [
    PrismaModule,
    forwardRef(() => require('../whatsapp/whatsapp.module').WhatsappModule),
    ScheduleModule.forRoot(),
    KycModule,
    forwardRef(() => CampaignsModule),
    forwardRef(() => BillingModule),
    AuditModule,
    forwardRef(() => WalletModule),
    FraudModule,
    PartnershipsModule,
    MetricsModule,
    KloelAudioModule,
    KloelRulesModule,
    forwardRef(() => require('../inbox/inbox.module').InboxModule),
    ContactsModule,
    LineageModule,
    DriftModule,
    RiskClassModule,
  ],
  controllers: [
    KloelController,
    KloelDataController,
    GuestChatController,
    WhatsAppBrainController,
    PaymentController,
    OnboardingProfileController,
    MemoryController,
    PdfProcessorController,
    WalletController,
    UnifiedAgentController,
    SmartPaymentController,
    DiagnosticsController,
    ProductController,
    ProductPlanController,
    ProductCheckoutController,
    ProductCouponController,
    ProductUrlController,
    ProductCampaignController,
    ProductAIConfigController,
    ProductReviewController,
    ProductCommissionController,
    ProductAffiliateController,
    UploadController,
    SalesController,
    SalesOrdersController,
    SalesSubscriptionsController,
    SiteController,
    SitePublicController,
    CanvasController,
    LeadsController,
    AdRulesController,
    WebinarController,
    ChannelSetupController,
    BrainRuntimeController,
    LacunasController,
    MindController,
  ],
  providers: [
    { provide: KLOEL_COMPOSER_E2E_GUARD, useClass: NoopKloelComposerE2EGuard },
    { provide: KLOEL_LLM_E2E_GUARD, useClass: NoopKloelLLME2EGuard },
    KloelService,
    KloelThinkerService,
    KloelReplyEngineService,
    KloelThreadSearchService,
    KloelThreadService,
    KloelThreadSummaryService,
    KloelChatToolsService,
    KloelCodeToolsService,
    KloelProductSubResourceToolsService,
    KloelWalletSalesToolsService,
    KloelBusinessConfigToolsService,
    KloelCodeAnalysisService,

    KloelReflexivityService,

    KloelWhatsAppToolsService,
    UnifiedAgentToolExecutorService,

    KloelLeadBrainService,
    KloelToolDispatcherService,
    KloelToolExecutorService,
    KloelComposerService,
    KloelLeadProcessorService,
    KloelWorkspaceContextService,
    GuestChatService,
    WhatsAppBrainService,
    PaymentService,
    OnboardingService,
    ConversationalOnboardingService,
    ConversationalOnboardingToolsService,
    AbiBuilderService,
    KloelToolExecutorBillingService,
    KloelToolExecutorCrmService,
    KloelToolExecutorWhatsAppService,
    KloelWorkspaceContextDataService,
    KloelWorkspaceContextLinkedProductService,
    MemoryCrudService,
    MemorySearchService,
    MemoryService,
    MemoryManagementService,
    MarketingSkillLoader,
    MarketingSkillRouter,
    MarketingSkillContextBuilder,
    MarketingSkillService,
    PdfProcessorService,
    WalletService,
    WalletLedgerService,
    LLMBudgetService,
    UnifiedAgentService,
    { provide: UNIFIED_AGENT_TOKEN, useExisting: UnifiedAgentService },
    UnifiedAgentContextService,
    UnifiedAgentContextDataService,
    UnifiedAgentResponseService,
    UnifiedAgentActionsService,
    UnifiedAgentActionsMessagingService,
    UnifiedAgentActionsCrmService,
    UnifiedAgentActionsSalesService,
    UnifiedAgentActionsWorkspaceService,
    UnifiedAgentActionsBillingService,
    UnifiedAgentActionsCommerceService,
    SmartPaymentService,
    WorkspaceGuard,
    LeadsService,
    OrderAlertsService,
    AdRulesEngineService,
    EmailCampaignService,
    CartRecoveryService,
    WebhooksService,
    WebhookDispatcherService,
    BrainCapabilityRegistryService,
    BrainCapabilityExecutorService,
    BrainAutonomyService,
    BrainCommercialGraphService,
    BrainEventSpineService,
    BrainRuntimeService,
    InstagramChannelTransport,
    MessengerChannelTransport,
    TikTokChannelTransport,
    EmailChannelTransport,
    WhatsAppChannelTransport,
    ChannelTransportRegistry,
    ChannelSetupService,
    CommercialDecisionOrchestratorService,
    RuntimeConversationTracerService,
    ContactIdentityResolverService,
    DailyLimitService,
    MindBeliefService,
    MindBanditService,
    MindCaseMemoryService,
    MindConceptService,
    KloelGlobalPriorService,
    MindGlobalPriorService,
    MindEventProcessorService,
    MindGuardContextBuilderService,
    MindGuardsService,
    MindObservabilityService,
    MindPerceptionService,
    MindPolicyService,
    MindPredictorService,
    MindProcessorService,
    MindQualityService,
    MindReportService,
    MindReplayService,
    MindSimulatorService,
    MindSyntheticGeneratorService,
    MindService,
    MindSurpriseService,
    DecisionOutcomeService,
    MindLiftReportService,
    MindVerbalizerService,
    MindWorkspaceStateService,
    PulseArtifactService,
    AgentRuntimeContextService,
    AgentRuntimeContextCompressorService,
    AgentRuntimeBuiltinMemoryProvider,
    AgentRuntimeEvidenceStoreService,
    AgentRuntimeMemoryCuratorService,
    AgentRuntimeMemoryManagerService,
    AgentRuntimeJobRunnerService,
    AgentRuntimePolicyService,
    AgentRuntimePulseSelfModelService,
    AgentRuntimeSchedulerService,
    AgentRuntimeSessionStore,
    AgentRuntimeSkillRegistry,
  ],
  exports: [
    KloelService,
    KloelCodeToolsService,

    KloelThinkerService,
    KloelReplyEngineService,
    KloelThreadSearchService,
    KloelThreadService,
    KloelThreadSummaryService,
    KloelChatToolsService,
    KloelBusinessConfigToolsService,
    KloelWhatsAppToolsService,
    KloelLeadBrainService,
    KloelToolDispatcherService,
    KloelToolExecutorService,
    KloelComposerService,
    KloelLeadProcessorService,
    KloelWorkspaceContextService,
    GuestChatService,
    WhatsAppBrainService,
    PaymentService,

    OnboardingService,
    ConversationalOnboardingService,
    MemoryCrudService,
    MemorySearchService,
    MemoryService,
    MemoryManagementService,
    PdfProcessorService,
    WalletService,
    WalletLedgerService,
    LLMBudgetService,
    KloelAudioModule,
    UnifiedAgentService,
    UnifiedAgentContextDataService,
    UnifiedAgentActionsMessagingService,
    UnifiedAgentActionsCrmService,
    UnifiedAgentActionsSalesService,
    UnifiedAgentActionsWorkspaceService,
    UnifiedAgentActionsBillingService,
    UnifiedAgentActionsCommerceService,
    SmartPaymentService,
    OrderAlertsService,
    AdRulesEngineService,
    EmailCampaignService,
    ChannelTransportRegistry,
    BrainEventSpineService,
    CommercialDecisionOrchestratorService,
    RuntimeConversationTracerService,
    MindBeliefService,
    MindBanditService,
    KloelGlobalPriorService,
    MindGlobalPriorService,
    MindPolicyService,
    MindService,
    KloelRulesModule,
    MindObservabilityService,
    MindReportService,
    MindLiftReportService,
    MindVerbalizerService,
    DecisionOutcomeService,
    AgentRuntimeContextService,
    AgentRuntimeContextCompressorService,
    AgentRuntimeBuiltinMemoryProvider,
    AgentRuntimeEvidenceStoreService,
    AgentRuntimeMemoryCuratorService,
    AgentRuntimeMemoryManagerService,
    AgentRuntimeJobRunnerService,
    AgentRuntimePolicyService,
    AgentRuntimePulseSelfModelService,
    AgentRuntimeSchedulerService,
    AgentRuntimeSessionStore,
    AgentRuntimeSkillRegistry,
  ],
})
export class KloelModule {}
