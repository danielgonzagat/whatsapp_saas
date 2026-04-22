import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { AgentAssistService } from './agent-assist.service';
import { HiddenDataExtractorService } from './hidden-data.service';
import { KnowledgeBaseController } from './knowledge-base.controller';
import { KnowledgeBaseService } from './knowledge-base.service';
import { MediaFactoryService } from './media-factory.service';
import { VectorService } from './vector.service';

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
export class AiBrainModule {}
