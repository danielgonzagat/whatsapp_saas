import { Injectable } from '@nestjs/common';
import { WisdomPrivacyGuardService } from './wisdom-privacy-guard.service';
import { extractChannelEfficiencyPatterns, extractConversionDecayPatterns, extractEngagementPeakPatterns, extractObjectionPatterns, extractOfferObjectionCorrelationPatterns } from './wisdom-pattern-extracted.helpers';
import { MIN_WORKSPACES, aggregateSignals, conversionRate, dealCloseRate, emitCampaignPatterns, emitProductConcentrationPatterns, emitRatePatterns, emitStagePatterns, emitVolumePatterns, enrichSignal, handoffRate, refundRate, replyRate } from './wisdom-pattern-signal.helpers';
import type { CandidatePattern, ExtractedPattern, WorkspaceEventSet } from './wisdom.types';
/**
 * WISDOM-001 — Pattern Extractor (enhanced).
 *
 * Extracts 5 categories of abstract cross-workspace patterns from
 * anonymized per-workspace event sets. Every extracted pattern passes
 * through WisdomPrivacyGuardService.enforceKAnonimity() with minK=5.
 *
 * Integration:
 *   - DI-injected WisdomPrivacyGuardService for k-anonymity gate
 *   - Returns ExtractedPattern[] with no PII, no workspaceId
 *
 * Backward compatible: extractCandidates() returns CandidatePattern[]
 * for existing downstream consumers.
 */
@Injectable()
export class WisdomPatternExtractorService {
  constructor(private readonly privacyGuard?: WisdomPrivacyGuardService) {}
  /**
   * Extract candidate patterns (backward-compatible).
   * Does NOT apply k-anonymity gate. For the full privacy-protected
   * pipeline, use extractPatterns() instead.
   */
  public extract(sets: readonly WorkspaceEventSet[]): CandidatePattern[] {
    if (sets.length < MIN_WORKSPACES) {return [];}
    const signals = sets.map((s) => aggregateSignals(s.events, s.workspaceId));
    const patterns: CandidatePattern[] = [];
    patterns.push(...emitRatePatterns(signals, 'conversion_rate', conversionRate, 0));
    patterns.push(...emitRatePatterns(signals, 'reply_rate', replyRate, 0));
    patterns.push(...emitRatePatterns(signals, 'refund_rate', refundRate, 0));
    patterns.push(...emitRatePatterns(signals, 'handoff_rate', handoffRate, 0));
    patterns.push(...emitRatePatterns(signals, 'deal_close_rate', dealCloseRate, 0));
    patterns.push(...emitVolumePatterns(signals));
    patterns.push(...emitCampaignPatterns(signals));
    patterns.push(...emitStagePatterns(signals));
    patterns.push(...emitProductConcentrationPatterns(signals));
    return patterns;
  }
  /**
   * Extract enhanced patterns with 5 categories, all gated by
   * k-anonymity (minK=5) via WisdomPrivacyGuardService.
   *
   * Categories:
   *   - objection_pattern        (common objections cross-workspace)
   *   - channel_efficiency       (best converting channels)
   *   - conversion_decay         (funnel stage dropoffs)
   *   - engagement_peak          (peak activity hours)
   *   - offer_objection_correlation (offer types linked to objections)
   */
  public extractPatterns(sets: readonly WorkspaceEventSet[]): ExtractedPattern[] {
    if (sets.length < MIN_WORKSPACES) {return [];}
    const signals = sets.map((s) => aggregateSignals(s.events, s.workspaceId));
    const enriched = signals.map((sig, i) => enrichSignal(sets[i]?.events ?? [], sig));
    const patterns: ExtractedPattern[] = [];
    patterns.push(...extractObjectionPatterns(this.privacyGuard, enriched));
    patterns.push(...extractChannelEfficiencyPatterns(this.privacyGuard, enriched));
    patterns.push(...extractConversionDecayPatterns(this.privacyGuard, enriched));
    patterns.push(...extractEngagementPeakPatterns(this.privacyGuard, signals));
    patterns.push(...extractOfferObjectionCorrelationPatterns(this.privacyGuard, enriched));
    return patterns;
  }
}
