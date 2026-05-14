import { Module, forwardRef } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SpineModule } from '../kloel/spine/spine.module';
import { KycEventEmitterService } from '../kloel/kyc-emitter/kyc-event-emitter.service';
import { KycApprovedGuard } from './kyc-approved.guard';
import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';

/** Kyc module. */
@Module({
  imports: [PrismaModule, SpineModule, forwardRef(() => PaymentsModule)],
  controllers: [KycController],
  providers: [KycService, KycApprovedGuard, KycEventEmitterService],
  exports: [KycService, KycApprovedGuard, KycEventEmitterService],
})
export class KycModule {}
