import type { PulseAdviceLevel, PulseOrganismStatus } from './pulse.service.contract';

const S_RE = /\s+/g;

/** Safe json parse. */
export function safeJsonParse<T>(value: string | null | undefined): T | null {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}
/** Compact text. */
export function compactText(value: string, max = 600) {
  const compact = value.replace(S_RE, ' ').trim();
  if (compact.length <= max) {
    return compact;
  }
  return `${compact.slice(0, max - 3)}...`;
}
/** To organism status. */
export function toOrganismStatus(input: string): Exclude<PulseOrganismStatus, 'STALE'> {
  if (input === 'UP' || input === 'DEGRADED' || input === 'DOWN') {
    return input;
  }
  return 'DEGRADED';
}
/** Build advice for the current organism status. */
export function buildOrganismAdvice(
  status: PulseOrganismStatus,
  counters: {
    criticalDown: number;
    criticalDegraded: number;
    surfaceProblems: number;
    staleNodes: number;
    incidentCount: number;
  },
): { level: PulseAdviceLevel; summary: string; recommendedActions: string[] } {
  if (status === 'DOWN') {
    return {
      level: 'critical',
      summary: `Critical organism nodes are down or stale (${counters.criticalDown} affected). Prioritize restoration before expanding the mutation surface.`,
      recommendedActions: [
        'Inspect the affected backend/worker nodes first.',
        'Re-run runtime probes after restoring the failing heartbeat.',
        'Avoid unrelated high-risk edits until the organism is stable again.',
      ],
    };
  }
  if (status === 'DEGRADED' || status === 'STALE') {
    return {
      level: 'watch',
      summary:
        status === 'STALE'
          ? `Live circulation is missing or stale (${counters.staleNodes} stale nodes). Treat runtime certainty as low until fresh heartbeats return.`
          : `Organism is degraded (${counters.criticalDegraded} critical degraded nodes, ${counters.surfaceProblems} impaired surfaces). Continue with caution and validate the affected surfaces before broad changes.`,
      recommendedActions: [
        'Check stale or degraded nodes and refresh their heartbeat.',
        'Validate the impacted surface before touching adjacent domains.',
        'Use PULSE as guidance, not as a blocker, until live evidence is fresh again.',
      ],
    };
  }
  return {
    level: 'nominal',
    summary: `Organism is live with ${counters.incidentCount} recent incident(s) and no current critical degradation.`,
    recommendedActions: [
      'Follow the top convergence actions from the latest PULSE directive.',
      'Keep heartbeats flowing while modifying adjacent domains.',
      'Re-run PULSE after meaningful changes to refresh the organism map.',
    ],
  };
}
