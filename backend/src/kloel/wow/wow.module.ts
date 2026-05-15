import { Module } from '@nestjs/common';
import { ColdStartIngestionService } from './cold-start-ingestion.service';
import { PatternDetectorService } from './pattern-detector.service';
import { FirstHourOrchestratorService } from './first-hour.orchestrator.service';

@Module({
  providers: [ColdStartIngestionService, PatternDetectorService, FirstHourOrchestratorService],
  exports: [ColdStartIngestionService, PatternDetectorService, FirstHourOrchestratorService],
})
export class WowModule {}
