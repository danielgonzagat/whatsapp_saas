import { Injectable } from '@nestjs/common';
import type { Narrative, NarrativeInput } from './commem.types';
import { workspaceFilter, eventsInWindow, eventDomain, clamp } from './commem.types';
import type { SpineEventRef } from '../mind/mind.types';

function generateNarrativeSummary(events: readonly SpineEventRef[], periodDays: number): string {
  if (events.length === 0) {
    return `No cognitive events recorded in the ${periodDays}-day period. The workspace is in a cold-start state.`;
  }

  const domains = new Set(events.map((e) => eventDomain(e.eventName)));
  const domainList = [...domains].slice(0, 5).join(', ');
  const domainSuffix = domains.size > 5 ? ` (+${domains.size - 5} more)` : '';

  const positiveCount = events.filter((e) => e.valence === 'positive').length;
  const negativeCount = events.filter((e) => e.valence === 'negative').length;
  const netSignal = positiveCount > negativeCount ? 'positive' : negativeCount > positiveCount ? 'challenging' : 'neutral';

  return (
    `Over ${periodDays} days, the workspace recorded ${events.length} cognitive events ` +
    `across ${domains.size} domains (${domainList}${domainSuffix}). ` +
    `The commercial signal is ${netSignal} (${positiveCount} positive vs ${negativeCount} negative events). ` +
    `${negativeCount > 0 ? 'Attention required on negative signals.' : 'Trajectory looks healthy.'}`
  );
}

function generateFindings(events: readonly SpineEventRef[]): readonly string[] {
  if (events.length === 0) {return ['No events to analyze'];}

  const findings: string[] = [];
  const domainCounts: Record<string, number> = {};

  for (const e of events) {
    const d = eventDomain(e.eventName);
    domainCounts[d] = (domainCounts[d] ?? 0) + 1;
  }

  const sorted = Object.entries(domainCounts).sort((a, b) => b[1] - a[1]);
  const topDomain = sorted[0];
  if (topDomain) {
    findings.push(`Dominant activity in ${topDomain[0]} (${topDomain[1]} events)`);
  }

  const observed = events.filter((e) => e.truthMode === 'observed').length;
  const inferred = events.filter((e) => e.truthMode === 'inferred').length;
  const projected = events.filter((e) => e.truthMode === 'projected').length;

  if (observed > 0) {findings.push(`${observed} observed (real) events — ground truth`);}
  if (inferred > 0) {findings.push(`${inferred} inferred events — pattern-based reasoning`);}
  if (projected > 0) {findings.push(`${projected} projected events — forward-looking signals`);}

  const negativeEvents = events.filter((e) => e.valence === 'negative');
  if (negativeEvents.length > 0) {
    const negDomains = [...new Set(negativeEvents.map((e) => eventDomain(e.eventName)))];
    findings.push(
      `${negativeEvents.length} negative-valence events across ${negDomains.length} domains — review recommended`,
    );
  }

  return findings;
}

function generateRecommendations(
  events: readonly SpineEventRef[],
): readonly string[] {
  if (events.length === 0) {
    return ['Begin generating spine events to build cognitive capital'];
  }

  const recommendations: string[] = [];
  const domains = new Set(events.map((e) => eventDomain(e.eventName)));

  if (!domains.has('commerce.payment')) {
    recommendations.push('Enable payment tracking to quantify commercial capital');
  }

  if (!domains.has('commerce.crm')) {
    recommendations.push('Connect CRM pipeline for deal-stage intelligence');
  }

  const negativeCount = events.filter((e) => e.valence === 'negative').length;
  const totalCount = events.length;

  if (negativeCount / totalCount > 0.3) {
    recommendations.push(
      `Negative signal ratio is high (${Math.round((negativeCount / totalCount) * 100)}%) — schedule intervention review`,
    );
  }

  const inferredCount = events.filter((e) => e.truthMode === 'inferred').length;
  if (inferredCount / totalCount > 0.5) {
    recommendations.push('High ratio of inferred events — increase ground-truth data collection');
  }

  if (recommendations.length === 0) {
    recommendations.push('Continue current trajectory — cognitive capital is growing healthily');
  }

  return recommendations;
}

@Injectable()
export class NarrativeBuilder {
  public build(input: NarrativeInput): Narrative {
    const scoped = workspaceFilter(input.events, input.workspaceId);
    const timed = eventsInWindow(scoped, input.periodStartMs, input.periodEndMs);

    const periodDays = Math.max(
      1,
      Math.round((input.periodEndMs - input.periodStartMs) / (24 * 3600_000)),
    );

    const summary = generateNarrativeSummary(timed, periodDays);
    const keyFindings = generateFindings(timed);
    const recommendations = generateRecommendations(timed);

    const confidence =
      timed.length >= 10 ? clamp(0.5 + timed.length / 100, 0.5, 0.95) : clamp(timed.length / 20, 0.1, 0.5);

    return {
      workspaceId: input.workspaceId,
      generatedAt: new Date().toISOString(),
      periodStartMs: input.periodStartMs,
      periodEndMs: input.periodEndMs,
      summary,
      keyFindings,
      recommendations,
      confidence,
    };
  }
}
