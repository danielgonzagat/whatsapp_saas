import { Module } from '@nestjs/common';
import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';
import { PrismaModule } from '../prisma/prisma.module';
import { KycApprovedGuard } from './kyc-approved.guard';

@Module({
  imports: [PrismaModule],
  controllers: [KycController],
  providers: [KycService, KycApprovedGuard],
  exports: [KycService, KycApprovedGuard],
})
export class KycModule {}
