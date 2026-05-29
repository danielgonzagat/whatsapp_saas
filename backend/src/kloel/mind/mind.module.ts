import { forwardRef, Module } from '@nestjs/common';
import { CiaModule } from './cia/cia.module';
import { SpineModule } from '../spine/spine.module';
import { MindKnowledgeModule } from './knowledge/knowledge.module';
import { AttentionService } from './attention.service';
import { ConsolidationService } from './consolidation.service';
import { HebbianService } from './hebbian.service';
import { MindBackgroundProcessor } from './mind-bg.processor';
import { MindBackgroundScheduler } from './mind-bg.scheduler';
import { MindEventIngestor } from './coordination/mind-event-ingestor.service';
import { MindEventSpine } from './coordination/mind-event-spine.service';
import { MultiTimescaleCoordinator } from './multi-timescale.coordinator';
import { ValenceAggregatorService } from './valence-aggregator.service';
import { ValenceTaggerService } from './valence-tagger.service';
import { MindCaseMemoryService } from './memory/mind-case-memory.service';
import { MindGlobalPriorService } from './memory/mind-global-prior.service';
import { MindWorkspaceStateService } from './memory/mind-workspace-state.service';
import { MindSelfModelService } from './self-model/mind-self-model.service';
import { MindPerceptionService } from './perception/mind-perception.service';
import { MindPredictionService } from './mind-prediction.service';
import { MindMessageService } from './aliases/mind-message.service';
import { MindMemoryItemService } from './aliases/mind-memory-item.service';
import { MindCanonicalService } from './mind-canonical.service';

/**
 * MIND module — wires the cognitive substrate services into Nest DI.
 * UTPs: VALENCE-001/002, ATT-001/002, HEB-001/002, CONS-001/002,
 * MULTI-001, BG-001.
 *
 * Imports SpineModule via forwardRef because SpineModule imports
 * MindModule (circular). The scheduler needs SpineEmitterService
 * to read recent spine events for each background tick.
 */
@Module({
  imports: [forwardRef(() => CiaModule), forwardRef(() => SpineModule), MindKnowledgeModule],
  providers: [
    ValenceTaggerService,
    ValenceAggregatorService,
    AttentionService,
    HebbianService,
    ConsolidationService,
    MultiTimescaleCoordinator,
    { provide: 'MULTI_TIMESCALE_CONFIG', useValue: { long: { intervalMs: 120_000 } } },
    MindBackgroundProcessor,
    MindBackgroundScheduler,
    MindEventIngestor,
    MindEventSpine,
    MindPerceptionService,
    MindPredictionService,
    MindCaseMemoryService,
    MindGlobalPriorService,
    MindWorkspaceStateService,
    MindSelfModelService,
    MindMessageService,
    MindMemoryItemService,
    MindCanonicalService,
  ],
  exports: [
    MindKnowledgeModule,
    ValenceTaggerService,
    ValenceAggregatorService,
    AttentionService,
    HebbianService,
    ConsolidationService,
    MultiTimescaleCoordinator,
    MindBackgroundProcessor,
    MindBackgroundScheduler,
    MindPerceptionService,
    MindPredictionService,
    MindCaseMemoryService,
    MindGlobalPriorService,
    MindWorkspaceStateService,
    MindSelfModelService,
    MindMessageService,
    MindMemoryItemService,
    MindCanonicalService,
  ],
})
export class MindModule {}
