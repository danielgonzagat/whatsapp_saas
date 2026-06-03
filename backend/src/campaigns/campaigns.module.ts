import { Module, forwardRef } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { AuditModule } from '../audit/audit.module';
import { BillingModule } from '../billing/billing.module';
import { CampaignEventEmitterService } from '../kloel/campaign-emitter/campaign-event-emitter.service';
import { SpineModule } from '../kloel/spine/spine.module';
import { WhatsappModule } from '../marketing/channels/whatsapp/whatsapp.module';
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
    // P0-B: provides WhatsappMessageDispatcherService for the compliant
    // bulk-blast path (KLOEL_COMPLIANT_WHATSAPP_SEND). forwardRef avoids the
    // campaigns -> whatsapp -> kloel module cycle at construction time.
    forwardRef(() => WhatsappModule),
  ],
  controllers: [CampaignsController],
  providers: [CampaignsService, CampaignEventEmitterService],
  exports: [CampaignsService],
})
/**
 * @cluster whatsapp_saas/backend/campaigns
 * L11 multi-agent TaskGraph annotation (batched by tools/auto-pr/batch-job.mjs).
 */
export class CampaignsModule {}
