import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { KnowledgeBaseController } from './knowledge-base.controller';
import { KnowledgeBaseService } from './knowledge-base.service';
import { VectorService } from './vector.service';
import { AgentAssistService } from './agent-assist.service';
import { HiddenDataExtractorService } from './hidden-data.service';
import { SalesSimulatorService } from './sales-simulator.service';
import { MediaFactoryService } from './media-factory.service';
import { MarketingGeniusService } from './marketing-genius.service';
import { StorytellingService } from './storytelling.service';
import { SpiderService } from './spider.service';
import { FlowQaService } from './flow-qa.service';
import { EduFlowService } from './edu-flow.service';
import { MultiAgentService } from './multi-agent.service';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [ConfigModule, PrismaModule, BillingModule],
  controllers: [KnowledgeBaseController],
  providers: [
    KnowledgeBaseService,
    VectorService,
    AgentAssistService,
    HiddenDataExtractorService,
    SalesSimulatorService,
    MediaFactoryService,
    MarketingGeniusService,
    StorytellingService,
    SpiderService,
    FlowQaService,
    EduFlowService,
    MultiAgentService,
  ],
  exports: [
    KnowledgeBaseService,
    VectorService,
    AgentAssistService,
    HiddenDataExtractorService,
    SalesSimulatorService,
    MediaFactoryService,
    MarketingGeniusService,
    StorytellingService,
    SpiderService,
    FlowQaService,
    EduFlowService,
    MultiAgentService,
  ],
})
export class AiBrainModule {}
