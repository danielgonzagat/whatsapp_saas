import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { KloelService } from './kloel.service';
import { KloelController } from './kloel.controller';
import { GuestChatController } from './guest-chat.controller';
import { GuestChatService } from './guest-chat.service';
import { WhatsAppBrainController } from './whatsapp-brain.controller';
import { WhatsAppBrainService } from './whatsapp-brain.service';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { ConversationalOnboardingService } from './conversational-onboarding.service';

import { MemoryController } from './memory.controller';
import { MemoryService } from './memory.service';
import { MemoryManagementService } from './memory-management.service';
import { PdfProcessorController } from './pdf-processor.controller';
import { PdfProcessorService } from './pdf-processor.service';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

import { AsaasService } from './asaas.service';
import { AudioController } from './audio.controller';
import { AudioService } from './audio.service';
import { UnifiedAgentController } from './unified-agent.controller';
import { UnifiedAgentService } from './unified-agent.service';
import {
  ProductPlanController,
  ProductCheckoutController,
  ProductCouponController,
  ProductUrlController,
  ProductCampaignController,
  ProductAIConfigController,
  ProductReviewController,
  ProductCommissionController,
  ProductAffiliateController,
} from './product-sub-resources.controller';
import { SmartPaymentController } from './smart-payment.controller';
import { SmartPaymentService } from './smart-payment.service';
import { DiagnosticsController } from './diagnostics.controller';
import { ProductController } from './product.controller';
import { UploadController } from './upload.controller';
import { SalesController } from './sales.controller';
import { SiteController } from './site.controller';
import { SitePublicController } from './site-public.controller';
import { CanvasController } from './canvas.controller';
import { LeadsController } from './leads.controller';
import { AdRulesController } from './ad-rules.controller';
import { WebinarController } from './webinar.controller';
import { CartRecoveryService } from './cart-recovery.service';
import { LeadsService } from './leads.service';
import { OrderAlertsService } from './order-alerts.service';
import { AdRulesEngineService } from './ad-rules-engine.service';
import { EmailCampaignService } from './email-campaign.service';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { KycModule } from '../kyc/kyc.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => WhatsappModule),
    ScheduleModule.forRoot(),
    KycModule,
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
    PdfProcessorService,
    WalletService,
    AsaasService,
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
    AsaasService,
    AudioService,
    UnifiedAgentService,
    SmartPaymentService,
    OrderAlertsService,
    AdRulesEngineService,
    EmailCampaignService,
  ],
})
export class KloelModule {}
