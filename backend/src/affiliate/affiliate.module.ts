import { Module } from '@nestjs/common';
import { AffiliateController } from './affiliate.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { KycModule } from '../kyc/kyc.module';

@Module({
  imports: [PrismaModule, KycModule],
  controllers: [AffiliateController],
})
export class AffiliateModule {}
