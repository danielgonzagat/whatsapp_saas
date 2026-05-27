import { WisdomPrivacyGuardService } from './wisdom-privacy-guard.service';
import { K_ANONYMITY_THRESHOLD, confidenceFromCount, makeCandidateId, passesKAnonymity, type InternalSignal } from './wisdom-pattern-signal.helpers';
import type { AggregatedSignal, ExtractedPattern } from './wisdom.types';
export function extractObjectionPatterns(
  guard: WisdomPrivacyGuardService | undefined,
  enriched: InternalSignal[],
): ExtractedPattern[] {
  const results: ExtractedPattern[] = [];
  const globalKeywordCounts = new Map<string, number>();
  const workspaceKeywordPresence = new Map<string, Set<string>>();
  for (const s of enriched) {
    if (s.objectionKeywords.size === 0) {continue;}
    const wsKeywords = new Set<string>();
    for (const [kw, count] of s.objectionKeywords) {
      globalKeywordCounts.set(kw, (globalKeywordCounts.get(kw) ?? 0) + count);
      wsKeywords.add(kw);
    }
    workspaceKeywordPresence.set(s.workspaceId, wsKeywords);
  }
  const activeWorkspaces = new Set(workspaceKeywordPresence.keys());
  if (activeWorkspaces.size < K_ANONYMITY_THRESHOLD) {return [];}
  const topKeywords = Array.from(globalKeywordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  for (const [kw, _count] of topKeywords) {
    const wsWithKeyword = [...workspaceKeywordPresence.entries()]
      .filter(([, kws]) => kws.has(kw))
      .map(([id]) => id);
    if (!passesKAnonymity(guard, wsWithKeyword, makeCandidateId())) {continue;}
    const pct = ((wsWithKeyword.length / activeWorkspaces.size) * 100).toFixed(0);
    const topExample = enriched
      .filter((s) => s.objectionKeywords.has(kw))
      .sort((a, b) => (b.objectionKeywords.get(kw) ?? 0) - (a.objectionKeywords.get(kw) ?? 0))[0];
    results.push({
      kind: 'objection_pattern',
      dimension: 'conversion',
      support: wsWithKeyword.length,
      confidence: confidenceFromCount(wsWithKeyword.length, enriched.length),
      abstractDescription: `Objection "${kw}" appears in ${wsWithKeyword.length} of ${activeWorkspaces.size} workspaces`,
      anonymizedExample: topExample
        ? `Workspace reports "${kw}" objection in ${topExample.objectionKeywords.get(kw)} of ${topExample.leadCount} leads`
        : `Objection "${kw}" detected cross-workspace (${pct}% coverage)`,
    });
  }
  return results;
}
export function extractChannelEfficiencyPatterns(
  guard: WisdomPrivacyGuardService | undefined,
  enriched: InternalSignal[],
): ExtractedPattern[] {
  const results: ExtractedPattern[] = [];
  const withChannelData = enriched.filter(
    (s) =>
      s.channelStats.whatsappConversionRate > 0 ||
      s.channelStats.campaignConversionRate > 0,
  );
  if (withChannelData.length < K_ANONYMITY_THRESHOLD) {return [];}
  const whatsappWs = withChannelData.filter(
    (s) => s.channelStats.whatsappConversionRate > 0,
  );
  const campaignWs = withChannelData.filter(
    (s) => s.channelStats.campaignConversionRate > 0,
  );
  if (whatsappWs.length >= K_ANONYMITY_THRESHOLD) {
    const avgWp =
      whatsappWs.reduce((sum, s) => sum + s.channelStats.whatsappConversionRate, 0) /
      whatsappWs.length;
    if (passesKAnonymity(guard, whatsappWs.map((s) => s.workspaceId), makeCandidateId())) {
      results.push({
        kind: 'channel_efficiency',
        dimension: 'channel',
        support: whatsappWs.length,
        confidence: confidenceFromCount(whatsappWs.length, withChannelData.length),
        abstractDescription: `WhatsApp channel converts at ${(avgWp * 100).toFixed(0)}% average across ${whatsappWs.length} workspaces`,
        anonymizedExample: `Workspace with active WhatsApp channel sees reply-to-conversion ratio of ${(avgWp * 100).toFixed(0)}%`,
      });
    }
  }
  if (campaignWs.length >= K_ANONYMITY_THRESHOLD) {
    const avgCamp =
      campaignWs.reduce((sum, s) => sum + s.channelStats.campaignConversionRate, 0) /
      campaignWs.length;
    if (passesKAnonymity(guard, campaignWs.map((s) => s.workspaceId), makeCandidateId())) {
      results.push({
        kind: 'channel_efficiency',
        dimension: 'channel',
        support: campaignWs.length,
        confidence: confidenceFromCount(campaignWs.length, withChannelData.length),
        abstractDescription: `Campaign channel converts at ${(avgCamp * 100).toFixed(0)}% average across ${campaignWs.length} workspaces`,
        anonymizedExample: `Workspace running campaigns sees click-to-conversion ratio of ${(avgCamp * 100).toFixed(0)}%`,
      });
    }
  }
  if (whatsappWs.length >= K_ANONYMITY_THRESHOLD && campaignWs.length >= K_ANONYMITY_THRESHOLD) {
    const avgWp =
      whatsappWs.reduce((sum, s) => sum + s.channelStats.whatsappConversionRate, 0) /
      whatsappWs.length;
    const avgCamp =
      campaignWs.reduce((sum, s) => sum + s.channelStats.campaignConversionRate, 0) /
      campaignWs.length;
    if (avgWp > avgCamp * 1.5) {
      const ratio = (avgWp / Math.max(avgCamp, 0.001)).toFixed(1);
      results.push({
        kind: 'channel_efficiency',
        dimension: 'channel',
        support: Math.min(whatsappWs.length, campaignWs.length),
        confidence: 0.7,
        abstractDescription: `WhatsApp channel converts ${ratio}x more than campaigns across ${Math.min(whatsappWs.length, campaignWs.length)} workspaces`,
        anonymizedExample: `Workspace using both channels: WhatsApp ${(avgWp * 100).toFixed(0)}% vs campaigns ${(avgCamp * 100).toFixed(0)}% conversion`,
      });
    }
  }
  return results;
}
export function extractConversionDecayPatterns(
  guard: WisdomPrivacyGuardService | undefined,
  enriched: InternalSignal[],
): ExtractedPattern[] {
  const results: ExtractedPattern[] = [];
  const withTransitions = enriched.filter((s) => s.stageTransitions.size >= 2);
  if (withTransitions.length < K_ANONYMITY_THRESHOLD) {return [];}
  const perWsStageCounts = new Map<string, Map<string, { entering: number; leaving: number }>>();
  for (const s of withTransitions) {
    const stageStats = new Map<string, { entering: number; leaving: number }>();
    for (const [transition, count] of s.stageTransitions) {
      const [from, to] = transition.split('->');
      if (!from || !to) {continue;}
      const fromStats = stageStats.get(from) ?? { entering: 0, leaving: 0 };
      fromStats.leaving += count;
      stageStats.set(from, fromStats);
      const toStats = stageStats.get(to) ?? { entering: 0, leaving: 0 };
      toStats.entering += count;
      stageStats.set(to, toStats);
    }
    perWsStageCounts.set(s.workspaceId, stageStats);
  }
  for (const [transition, _counts] of [...withTransitions[0]!.stageTransitions.entries()]) {
    const [fromStage, toStage] = transition.split('->');
    if (!fromStage || !toStage) {continue;}
    const decayWsIds: string[] = [];
    const dropRatios: number[] = [];
    for (const s of withTransitions) {
      const stats = perWsStageCounts.get(s.workspaceId);
      if (!stats) {continue;}
      const fromLeaving = stats.get(fromStage)?.leaving ?? 0;
      const toEntering = stats.get(toStage)?.entering ?? 0;
      const toLeaving = stats.get(toStage)?.leaving ?? 0;
      if (fromLeaving === 0) {continue;}
      const enteringRatio = toEntering / fromLeaving;
      if (enteringRatio < 0.5 && toEntering > 0) {
        decayWsIds.push(s.workspaceId);
        dropRatios.push(enteringRatio);
      }
      const leavingRatio = toLeaving / fromLeaving;
      if (leavingRatio < 0.5 && toLeaving > 0) {
        if (!decayWsIds.includes(s.workspaceId)) {
          decayWsIds.push(s.workspaceId);
          dropRatios.push(leavingRatio);
        }
      }
    }
    if (decayWsIds.length < K_ANONYMITY_THRESHOLD) {continue;}
    if (!passesKAnonymity(guard, decayWsIds, makeCandidateId())) {continue;}
    const avgDrop = dropRatios.reduce((a, b) => a + b, 0) / dropRatios.length;
    const dropPct = ((1 - avgDrop) * 100).toFixed(0);
    results.push({
      kind: 'conversion_decay',
      dimension: 'conversion',
      support: decayWsIds.length,
      confidence: confidenceFromCount(decayWsIds.length, withTransitions.length),
      abstractDescription: `Stage transition "${transition}" shows ${dropPct}% drop across ${decayWsIds.length} workspaces`,
      anonymizedExample: `Workspace pipeline: leads entering "${toStage}" drop ${dropPct}% compared to "${fromStage}" volume`,
    });
  }
  return results;
}
export function extractEngagementPeakPatterns(
  guard: WisdomPrivacyGuardService | undefined,
  signals: AggregatedSignal[],
): ExtractedPattern[] {
  const results: ExtractedPattern[] = [];
  const active = signals.filter((s) => s.totalEvents >= 50);
  if (active.length < K_ANONYMITY_THRESHOLD) {return [];}
  const hourPresence = new Map<number, number[]>();
  for (const s of active) {
    for (const h of s.peakHours) {
      if (!hourPresence.has(h)) {
        hourPresence.set(h, []);
      }
      hourPresence.get(h)?.push(s.totalEvents);
    }
  }
  for (const [hour, totals] of hourPresence) {
    if (totals.length < K_ANONYMITY_THRESHOLD) {continue;}
    const wsIds = active
      .filter((s) => s.peakHours.includes(hour))
      .map((s) => s.workspaceId);
    if (!passesKAnonymity(guard, wsIds, makeCandidateId())) {continue;}
    results.push({
      kind: 'engagement_peak',
      dimension: 'timing',
      support: totals.length,
      confidence: confidenceFromCount(totals.length, active.length),
      abstractDescription: `Peak activity detected at ${hour}:00 UTC in ${totals.length} workspaces`,
      anonymizedExample: `Workspace with consistent activity peaks at ${hour}:00 UTC, averaging ${(totals.reduce((a, b) => a + b, 0) / totals.length).toFixed(0)} events in that hour`,
    });
  }
  return results;
}
export function extractOfferObjectionCorrelationPatterns(
  guard: WisdomPrivacyGuardService | undefined,
  enriched: InternalSignal[],
): ExtractedPattern[] {
  const results: ExtractedPattern[] = [];
  const withBoth = enriched.filter(
    (s) => s.objectionKeywords.size > 0 && s.uniqueProductIds >= 1,
  );
  if (withBoth.length < K_ANONYMITY_THRESHOLD) {return [];}
  const topKw = Array.from(
    withBoth
      .flatMap((s) => [...s.objectionKeywords.entries()])
      .reduce((m, [k, v]) => {
        m.set(k, (m.get(k) ?? 0) + v);
        return m;
      }, new Map<string, number>())
      .entries(),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  for (const [kw] of topKw) {
    const wsWithBoth = withBoth.filter((s) => s.objectionKeywords.has(kw));
    if (wsWithBoth.length < K_ANONYMITY_THRESHOLD) {continue;}
    if (!passesKAnonymity(guard, wsWithBoth.map((s) => s.workspaceId), makeCandidateId())) {continue;}
    results.push({
      kind: 'offer_objection_correlation',
      dimension: 'offer',
      support: wsWithBoth.length,
      confidence: confidenceFromCount(wsWithBoth.length, enriched.length),
      abstractDescription: `Objection "${kw}" correlates with specific offers in ${wsWithBoth.length} workspaces`,
      anonymizedExample: `Workspace with multiple products sees "${kw}" objection concentrated on higher-ticket items`,
    });
  }
  return results;
}
