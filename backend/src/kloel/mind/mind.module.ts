import { forwardRef, Module } from '@nestjs/common';
import { SpineModule } from '../spine/spine.module';
import { AttentionService } from './attention.service';
import { ConsolidationService } from './consolidation.service';
import { HebbianService } from './hebbian.service';
import { MindBackgroundProcessor } from './mind-bg.processor';
import { MindBackgroundScheduler } from './mind-bg.scheduler';
import { MultiTimescaleCoordinator } from './multi-timescale.coordinator';
import { ValenceAggregatorService } from './valence-aggregator.service';
import { ValenceTaggerService } from './valence-tagger.service';

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
  imports: [forwardRef(() => SpineModule)],
  providers: [
    ValenceTaggerService,
    ValenceAggregatorService,
    AttentionService,
    HebbianService,
    ConsolidationService,
    MultiTimescaleCoordinator,
    MindBackgroundProcessor,
    MindBackgroundScheduler,
  ],
  exports: [
    ValenceTaggerService,
    ValenceAggregatorService,
    AttentionService,
    HebbianService,
    ConsolidationService,
    MultiTimescaleCoordinator,
    MindBackgroundProcessor,
  ],
})
export class MindModule {}
