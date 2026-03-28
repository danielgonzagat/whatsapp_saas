import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { KnowledgeBaseController } from './knowledge-base.controller';
import { KnowledgeBaseService } from './knowledge-base.service';
import { VectorService } from './vector.service';
import { AgentAssistService } from './agent-assist.service';
import { HiddenDataExtractorService } from './hidden-data.service';
import { MediaFactoryService } from './media-factory.service';
import { MarketingGeniusService } from './marketing-genius.service';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [ConfigModule, PrismaModule, BillingModule],
  controllers: [KnowledgeBaseController],
  providers: [
    KnowledgeBaseService,
    VectorService,
    AgentAssistService,
    HiddenDataExtractorService,
    MediaFactoryService,
    MarketingGeniusService,
  ],
  exports: [
    KnowledgeBaseService,
    VectorService,
    AgentAssistService,
    HiddenDataExtractorService,
    MediaFactoryService,
    MarketingGeniusService,
  ],
})
export class AiBrainModule {}
