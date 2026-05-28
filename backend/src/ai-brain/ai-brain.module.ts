import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { AgentAssistService } from '../kloel/mind/knowledge/agent-assist.service';
import { HiddenDataExtractorService } from '../kloel/mind/knowledge/hidden-data.service';
import { KnowledgeBaseController } from '../kloel/mind/knowledge/knowledge-base.controller';
import { KnowledgeBaseService } from '../kloel/mind/knowledge/knowledge-base.service';
import { MediaFactoryService } from '../kloel/mind/knowledge/media-factory.service';
import { VectorService } from '../kloel/mind/knowledge/vector.service';

import { BillingModule } from '../billing/billing.module';
import { WalletModule } from '../wallet/wallet.module';

/** Ai brain module. */
@Module({
  imports: [ConfigModule, PrismaModule, BillingModule, WalletModule],
  controllers: [KnowledgeBaseController],
  providers: [
    KnowledgeBaseService,
    VectorService,
    AgentAssistService,
    HiddenDataExtractorService,
    MediaFactoryService,
  ],
  exports: [
    KnowledgeBaseService,
    VectorService,
    AgentAssistService,
    HiddenDataExtractorService,
    MediaFactoryService,
  ],
})
/**
 * @cluster whatsapp_saas/backend/ai-brain
 * L11 multi-agent TaskGraph annotation (batched by tools/auto-pr/batch-job.mjs).
 */
export class AiBrainModule {}
