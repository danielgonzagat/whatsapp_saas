import { Module } from '@nestjs/common';
import { KloelService } from './kloel.service';
import { KloelController } from './kloel.controller';
import { WhatsAppBrainController } from './whatsapp-brain.controller';
import { WhatsAppBrainService } from './whatsapp-brain.service';
import { WhatsAppConnectionController } from './whatsapp-connection.controller';
import { WhatsAppConnectionService } from './whatsapp-connection.service';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { ConversationalOnboardingService } from './conversational-onboarding.service';
import { MemoryController } from './memory.controller';
import { MemoryService } from './memory.service';
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
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [
    KloelController,
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
  ],
  providers: [
    KloelService,
    WhatsAppBrainService,
    WhatsAppConnectionService,
    PaymentService,
    OnboardingService,
    ConversationalOnboardingService,
    MemoryService,
    PdfProcessorService,
    WalletService,
    SkillEngineService,
    AsaasService,
    ExternalPaymentService,
    AudioService,
  ],
  exports: [
    KloelService,
    WhatsAppBrainService,
    WhatsAppConnectionService,
    PaymentService,
    OnboardingService,
    ConversationalOnboardingService,
    MemoryService,
    PdfProcessorService,
    WalletService,
    SkillEngineService,
    AsaasService,
    ExternalPaymentService,
    AudioService,
  ],
})
export class KloelModule {}
