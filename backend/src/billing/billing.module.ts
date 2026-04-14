import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { PaymentMethodController } from './payment-method.controller';
import { PaymentMethodService } from './payment-method.service';
import { PlanLimitsService } from './plan-limits.service';

@Module({
  imports: [ConfigModule, PrismaModule, forwardRef(() => WhatsappModule)],
  providers: [BillingService, PlanLimitsService, PaymentMethodService],
  controllers: [BillingController, PaymentMethodController],
  exports: [BillingService, PlanLimitsService, PaymentMethodService],
})
export class BillingModule {}
