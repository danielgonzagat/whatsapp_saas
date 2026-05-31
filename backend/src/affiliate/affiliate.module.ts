import { Module } from '@nestjs/common';
import { KycModule } from '../kyc/kyc.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AffiliateController } from './affiliate.controller';
import { AffiliateMarketplaceController } from './affiliate-marketplace.controller';
import { AffiliateService } from './affiliate.service';

/** Affiliate module. */
@Module({
  imports: [PrismaModule, KycModule],
  controllers: [AffiliateController, AffiliateMarketplaceController],
  providers: [AffiliateService],
  exports: [AffiliateService],
})
/**
 * @cluster whatsapp_saas/backend/affiliate
 * L11 multi-agent TaskGraph annotation (batched by tools/auto-pr/batch-job.mjs).
 */
export class AffiliateModule {}
