import { Module } from '@nestjs/common';
import { RecommendationExplainerService } from './recommendation-explainer.service';
import { ConflictDetectorService } from './conflict-detector.service';
import { ConflictSilenceEnforcerService } from './conflict-silence-enforcer.service';
import { PlatformBiasMonitorService } from './platform-bias-monitor.service';
import { DisclosureEngineService } from './disclosure-engine.service';
import { ThirdPartyAuditExportService } from './third-party-audit-export.service';
import { UserFeedbackCorrectionService } from './user-feedback-correction.service';
import { RecommendationAttributionBuilderService } from './recommendation-attribution-builder.service';

/**
 * IncentModule — Camada XXXIV (UTP-INCENT-001..008).
 *
 * Recomendação cruzada sem conflito oculto, sem viés de plataforma.
 * Pure-logic module that explains recommendations, detects conflicts,
 * enforces silence under conflict, monitors platform bias, auto-discloses
 * Kloel↔party links, exports third-party audit bundles, processes user
 * feedback corrections, and builds recommendation attributions.
 *
 * All services operate on typed data structures with no external
 * dependencies. Uses canonical PCI.1 event taxonomy domain `incentive.*`.
 */
@Module({
  providers: [
    RecommendationExplainerService,
    ConflictDetectorService,
    ConflictSilenceEnforcerService,
    PlatformBiasMonitorService,
    DisclosureEngineService,
    ThirdPartyAuditExportService,
    UserFeedbackCorrectionService,
    RecommendationAttributionBuilderService,
  ],
  exports: [
    RecommendationExplainerService,
    ConflictDetectorService,
    ConflictSilenceEnforcerService,
    PlatformBiasMonitorService,
    DisclosureEngineService,
    ThirdPartyAuditExportService,
    UserFeedbackCorrectionService,
    RecommendationAttributionBuilderService,
  ],
})
export class IncentModule {}
