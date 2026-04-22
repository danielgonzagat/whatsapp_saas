import { Module, forwardRef } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { PrismaModule } from '../prisma/prisma.module';
import { KycApprovedGuard } from './kyc-approved.guard';
import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';

/** Kyc module. */
@Module({
  imports: [PrismaModule, forwardRef(() => PaymentsModule)],
  controllers: [KycController],
  providers: [KycService, KycApprovedGuard],
  exports: [KycService, KycApprovedGuard],
})
export class KycModule {}
