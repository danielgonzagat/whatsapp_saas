import { Module } from '@nestjs/common';
import { WisdomPatternExtractorService } from './wisdom-pattern-extractor.service';
import { WisdomProjectorService } from './wisdom-projector.service';
import { WisdomOptService } from './wisdom-opt';

/**
 * WisdomModule — Camada VI (UTP-WISDOM-001..008).
 *
 * Cross-workspace commercial wisdom: extracts abstract patterns
 * with k-anonymity + diff-privacy, validates by N workspaces,
 * tags with taxonomy, projects into ABI, filters by relevance,
 * and enforces opt-in/out + attribution guard.
 *
 * Exports: WisdomPatternExtractorService, WisdomProjectorService,
 * WisdomOptService for ABI builder and relevance filter consumption.
 */
@Module({
  providers: [
    WisdomPatternExtractorService,
    WisdomProjectorService,
    WisdomOptService,
  ],
  exports: [
    WisdomPatternExtractorService,
    WisdomProjectorService,
    WisdomOptService,
  ],
})
export class WisdomModule {}
