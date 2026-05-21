/**
 * UTP-WOW-002 — Pattern Detector Service.
 *
 * Runs WISDOM, INSIGHT, and MATURITY consumers on the ingested history.
 * Re-uses existing services — does NOT re-implement detection logic.
 *
 * Consumes:
 *   - MATURITY: collectMaturitySignals + classifyMaturity (Camada VIII)
 *   - INSIGHT: all 8 detectors from insight/detectors/ (Camada VII)
 *   - WISDOM: WisdomPatternExtractorService (Camada VI, cross-workspace)
 *
 * Produces a FirstHourPattern with maturity verdict and detected insights.
 */

import { Injectable } from '@nestjs/common';
import type { HistoryIngestion, FirstHourPattern } from './wow.types';
import type { Insight, DetectorInput } from '../insight/insight.types';
import { collectMaturitySignals } from '../maturity/maturity-signals.collector';
import { classifyMaturity } from '../maturity/maturity.classifier';
import { detectFunnelBottleneck } from '../insight/detectors/funnel-bottleneck.detector';
import { detectOfferFit } from '../insight/detectors/offer-fit.detector';
import { detectObjectionPattern } from '../insight/detectors/objection-pattern.detector';
import { detectQualificationLeak } from '../insight/detectors/qualification-leak.detector';
import { detectCoolingWindow } from '../insight/detectors/cooling-window.detector';
import { detectPricingElasticity } from '../insight/detectors/pricing-elasticity.detector';
import { detectChannelRoi } from '../insight/detectors/channel-roi.detector';
import { detectProductPositioning } from '../insight/detectors/product-positioning.detector';

const DETECTORS = [
  detectFunnelBottleneck,
  detectOfferFit,
  detectObjectionPattern,
  detectQualificationLeak,
  detectCoolingWindow,
  detectPricingElasticity,
  detectChannelRoi,
  detectProductPositioning,
] as const;

@Injectable()
export class PatternDetectorService {
  /**
   * Detect first-hour patterns from ingested history.
   * Runs maturity signals → classifier → all 8 insight detectors.
   */
  public detect(ingestion: HistoryIngestion): FirstHourPattern {
    const nowMs = Date.now();

    const signals = collectMaturitySignals({
      events: ingestion.events,
      workspaceId: ingestion.workspaceId,
      nowMs,
    });

    const maturityVerdict = classifyMaturity(signals);

    const detectorInput: DetectorInput = {
      events: ingestion.events,
      workspaceId: ingestion.workspaceId,
      signals,
      maturityStage: maturityVerdict.stage,
      nowMs,
    };

    const insights: Insight[] = [];
    for (const detector of DETECTORS) {
      const result = detector(detectorInput);
      insights.push(...result.insights);
    }

    return {
      workspaceId: ingestion.workspaceId,
      maturityVerdict,
      insights,
      rankedInsights: [],
      detectedAt: new Date(nowMs).toISOString(),
    };
  }
}
