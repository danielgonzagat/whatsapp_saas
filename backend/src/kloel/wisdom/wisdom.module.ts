import { Module } from '@nestjs/common';
import { WisdomPatternExtractorService } from './wisdom-pattern-extractor.service';
import { WisdomProjectorService } from './wisdom-projector.service';
import { WisdomOptService } from './wisdom-opt';
import { WisdomPrivacyGuardService } from './wisdom-privacy-guard.service';
import { WisdomRelevanceFilter } from './wisdom-relevance-filter.service';
import { WisdomPatternStore } from './wisdom-pattern-store.service';

/**
 * WisdomModule — Camada VI (UTP-WISDOM-001..008).
 *
 * Cross-workspace commercial wisdom: extracts abstract patterns
 * with k-anonymity + diff-privacy, validates by N workspaces,
 * tags with taxonomy, projects into ABI, filters by relevance,
 * and enforces opt-in/out + attribution guard.
 *
 * Exports: WisdomPatternExtractorService, WisdomProjectorService,
 * WisdomOptService, WisdomPrivacyGuardService for ABI builder
 * and relevance filter consumption.
 */
@Module({
  providers: [
    WisdomPatternExtractorService,
    WisdomProjectorService,
    WisdomOptService,
    WisdomPrivacyGuardService,
    WisdomRelevanceFilter,
    WisdomPatternStore,
  ],
  exports: [
    WisdomPatternExtractorService,
    WisdomProjectorService,
    WisdomOptService,
    WisdomPrivacyGuardService,
    WisdomRelevanceFilter,
    WisdomPatternStore,
  ],
})
export class WisdomModule {}
