import { Module } from '@nestjs/common';
import { ColdStartIngestionService } from './cold-start-ingestion.service';
import { PatternDetectorService } from './pattern-detector.service';
import { FirstHourOrchestratorService } from './first-hour.orchestrator.service';

/**
 * WowModule — Camada XI (UTP-WOW-001..006).
 *
 * First-Hour Wow: delivers a value shock within the first minutes
 * of workspace activation by ingesting available history, running
 * wisdom/insight/maturity consumers, ranking discoveries by impact,
 * packaging with evidence, and filtering by confidence.
 *
 * Exports:
 *   - ColdStartIngestionService  (WOW-001)
 *   - PatternDetectorService     (WOW-002)
 *   - FirstHourOrchestratorService (WOW-006)
 */
@Module({
  providers: [ColdStartIngestionService, PatternDetectorService, FirstHourOrchestratorService],
  exports: [ColdStartIngestionService, PatternDetectorService, FirstHourOrchestratorService],
})
export class WowModule {}
