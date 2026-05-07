import { Module } from '@nestjs/common';
import { KycModule } from '../kyc/kyc.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AffiliateController } from './affiliate.controller';
import { AffiliateMarketplaceController } from './affiliate-marketplace.controller';

/** Affiliate module. */
@Module({
  imports: [PrismaModule, KycModule],
  controllers: [AffiliateController, AffiliateMarketplaceController],
})
export class AffiliateModule {}
