import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { KloelService } from './kloel.service';
import { KloelController } from './kloel.controller';
import { GuestChatController } from './guest-chat.controller';
import { GuestChatService } from './guest-chat.service';
import { WhatsAppBrainController } from './whatsapp-brain.controller';
import { WhatsAppBrainService } from './whatsapp-brain.service';
import { WhatsAppConnectionController } from './whatsapp-connection.controller';
import { WhatsAppConnectionService } from './whatsapp-connection.service';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { ConversationalOnboardingService } from './conversational-onboarding.service';
import { OnboardingReengagementService } from './onboarding-reengagement.service';
import { MemoryController } from './memory.controller';
import { MemoryService } from './memory.service';
import { MemoryManagementService } from './memory-management.service';
import { PdfProcessorController } from './pdf-processor.controller';
import { PdfProcessorService } from './pdf-processor.service';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { SkillEngineService } from './skill-engine.service';
import { AsaasController } from './asaas.controller';
import { AsaasService } from './asaas.service';
import { ExternalPaymentController } from './external-payment.controller';
import { ExternalPaymentService } from './external-payment.service';
import { AudioController } from './audio.controller';
import { AudioService } from './audio.service';
import { UnifiedAgentController } from './unified-agent.controller';
import { UnifiedAgentService } from './unified-agent.service';
import { SmartPaymentController } from './smart-payment.controller';
import { SmartPaymentService } from './smart-payment.service';
import { MercadoPagoController } from './mercadopago.controller';
import { MercadoPagoService } from './mercadopago.service';
import { DiagnosticsController } from './diagnostics.controller';
import { ProductController } from './product.controller';
import { UploadController } from './upload.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { WorkspaceGuard } from '../common/guards/workspace.guard';

@Module({
  imports: [PrismaModule, WhatsappModule, ScheduleModule.forRoot()],
  controllers: [
    KloelController,
    GuestChatController,
    WhatsAppBrainController,
    WhatsAppConnectionController,
    PaymentController,
    OnboardingController,
    MemoryController,
    PdfProcessorController,
    WalletController,
    AsaasController,
    ExternalPaymentController,
    AudioController,
    UnifiedAgentController,
    SmartPaymentController,
    MercadoPagoController,
    DiagnosticsController,
    ProductController,
    UploadController,
  ],
  providers: [
    KloelService,
    GuestChatService,
    WhatsAppBrainService,
    WhatsAppConnectionService,
    PaymentService,
    OnboardingService,
    ConversationalOnboardingService,
    OnboardingReengagementService,
    MemoryService,
    MemoryManagementService,
    PdfProcessorService,
    WalletService,
    SkillEngineService,
    AsaasService,
    ExternalPaymentService,
    AudioService,
    UnifiedAgentService,
    SmartPaymentService,
    MercadoPagoService,
    WorkspaceGuard,
  ],
  exports: [
    KloelService,
    GuestChatService,
    WhatsAppBrainService,
    WhatsAppConnectionService,
    PaymentService,
    OnboardingService,
    ConversationalOnboardingService,
    MemoryService,
    MemoryManagementService,
    PdfProcessorService,
    WalletService,
    SkillEngineService,
    AsaasService,
    ExternalPaymentService,
    AudioService,
    UnifiedAgentService,
    SmartPaymentService,
    MercadoPagoService,
  ],
})
export class KloelModule {}
