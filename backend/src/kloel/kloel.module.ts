import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConversationalOnboardingService } from './conversational-onboarding.service';
import { GuestChatController } from './guest-chat.controller';
import { GuestChatService } from './guest-chat.service';
import { KloelController } from './kloel.controller';
import { KloelService } from './kloel.service';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { WhatsAppBrainController } from './whatsapp-brain.controller';
import { WhatsAppBrainService } from './whatsapp-brain.service';

import { LLMBudgetService } from './llm-budget.service';
import { MemoryManagementService } from './memory-management.service';
import { MemoryController } from './memory.controller';
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
import { PrismaModule } from '../prisma/prisma.module';
import { WalletModule } from '../wallet/wallet.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { AdRulesEngineService } from './ad-rules-engine.service';
import { AdRulesController } from './ad-rules.controller';
import { AudioController } from './audio.controller';
import { AudioService } from './audio.service';
import { CanvasController } from './canvas.controller';
import { CartRecoveryService } from './cart-recovery.service';
import { DiagnosticsController } from './diagnostics.controller';
import { EmailCampaignService } from './email-campaign.service';
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
import { SitePublicController } from './site-public.controller';
import { SiteController } from './site.controller';
import { SmartPaymentController } from './smart-payment.controller';
import { SmartPaymentService } from './smart-payment.service';
import { UnifiedAgentController } from './unified-agent.controller';
import { UnifiedAgentService } from './unified-agent.service';
import { UploadController } from './upload.controller';
import { WebinarController } from './webinar.controller';

/** Kloel module. */
@Module({
  imports: [
    PrismaModule,
    forwardRef(() => WhatsappModule),
    ScheduleModule.forRoot(),
    KycModule,
    forwardRef(() => CampaignsModule),
    forwardRef(() => BillingModule),
    AuditModule,
    forwardRef(() => WalletModule),
  ],
  controllers: [
    KloelController,
    GuestChatController,
    WhatsAppBrainController,
    PaymentController,
    OnboardingController,
    MemoryController,
    PdfProcessorController,
    WalletController,
    AudioController,
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
    SiteController,
    SitePublicController,
    CanvasController,
    LeadsController,
    AdRulesController,
    WebinarController,
  ],
  providers: [
    KloelService,
    GuestChatService,
    WhatsAppBrainService,
    PaymentService,
    OnboardingService,
    ConversationalOnboardingService,
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
    AudioService,
    UnifiedAgentService,
    SmartPaymentService,
    WorkspaceGuard,
    LeadsService,
    OrderAlertsService,
    AdRulesEngineService,
    EmailCampaignService,
    CartRecoveryService,
  ],
  exports: [
    KloelService,
    GuestChatService,
    WhatsAppBrainService,
    PaymentService,
    OnboardingService,
    ConversationalOnboardingService,
    MemoryService,
    MemoryManagementService,
    PdfProcessorService,
    WalletService,
    WalletLedgerService,
    LLMBudgetService,
    AudioService,
    UnifiedAgentService,
    SmartPaymentService,
    OrderAlertsService,
    AdRulesEngineService,
    EmailCampaignService,
  ],
})
export class KloelModule {}
