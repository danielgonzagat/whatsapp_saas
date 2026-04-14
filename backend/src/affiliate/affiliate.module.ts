import { Module } from '@nestjs/common';
import { KycModule } from '../kyc/kyc.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AffiliateController } from './affiliate.controller';

@Module({
  imports: [PrismaModule, KycModule],
  controllers: [AffiliateController],
})
export class AffiliateModule {}
