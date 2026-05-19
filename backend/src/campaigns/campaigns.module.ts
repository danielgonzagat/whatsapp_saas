import { Module, forwardRef } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { AuditModule } from '../audit/audit.module';
import { BillingModule } from '../billing/billing.module';
import { CampaignEventEmitterService } from '../kloel/campaign-emitter/campaign-event-emitter.service';
import { SpineModule } from '../kloel/spine/spine.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';

/** Campaigns module. */
@Module({
  imports: [
    PrismaModule,
    forwardRef(() => BillingModule),
    AuditModule,
    AnalyticsModule,
    SpineModule,
  ],
  controllers: [CampaignsController],
  providers: [CampaignsService, CampaignEventEmitterService],
  exports: [CampaignsService],
})
export class CampaignsModule {}
