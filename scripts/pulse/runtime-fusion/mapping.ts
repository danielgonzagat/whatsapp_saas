import { tokenize, unique } from '../signal-normalizers';
import { deriveUnitValue } from '../dynamic-reality-kernel/catalog-arithmetic';
import { discoverSignalSeverityLabels } from '../dynamic-reality-kernel/type-contract-engines';
import type { RuntimeSignal, SignalSeverity } from '../types.runtime-fusion';
import {
  ACTION_BLOCK_DEPLOY,
  ACTION_BLOCK_MERGE,
  bound01,
  normalizePathSeparators,
} from './helpers';
import { TREND_LABELS } from './parsing';

// ─── Mapping Signals to Capabilities ────────────────────────────────────────

/**
 * Map a runtime signal to capability IDs using file path matching and
 * message pattern matching against capability names.
 *
 * @param signal - The runtime signal to map.
 * @param capabilityState - Optional capability state for name matching.
 * @returns Array of matched capability IDs.
 */
export function mapSignalToCapabilities(
  signal: RuntimeSignal,
  capabilityState?: { capabilities?: Array<{ id: string; name: string; filePaths?: string[] }> },
): string[] {
  let ids = new Set(signal.affectedCapabilityIds);

  if (capabilityState?.capabilities) {
    let messageTokens = new Set(tokenize(signal.message));
    let hasObservedFileHints = signal.affectedFilePaths.length > 0;

    for (let capability of capabilityState.capabilities) {
      let nameTokens = tokenize(capability.name);

      let hasNameMatch = nameTokens.some(
        (nt) =>
          nt.length >= deriveUnitValue() + deriveUnitValue() + deriveUnitValue() &&
          messageTokens.has(nt),
      );

      let hasFilePathMatch = signal.affectedFilePaths.some((signalFile) => {
        let normalizedSignalFile = normalizePathSeparators(signalFile);
        return (capability.filePaths ?? []).some((capFile) => {
          let normalizedCapabilityFile = normalizePathSeparators(capFile);
          return (
            normalizedCapabilityFile.includes(normalizedSignalFile) ||
            normalizedSignalFile.includes(normalizedCapabilityFile)
          );
        });
      });

      if (hasFilePathMatch || (!hasObservedFileHints && hasNameMatch)) {
        ids.add(capability.id);
      }
    }
  }

  return Array.from(ids);
}

export function mapSignalToFlows(
  signal: RuntimeSignal,
  flowProjection?: {
    flows?: Array<{
      id: string;
      name: string;
      capabilityIds?: string[];
      routePatterns?: string[];
    }>;
  },
): string[] {
  let ids = new Set(signal.affectedFlowIds);
  if (!flowProjection?.flows) return Array.from(ids);

  let messageTokens = new Set(tokenize(signal.message));
  for (let flow of flowProjection.flows) {
    let capabilityMatch = (flow.capabilityIds ?? []).some((capabilityId) =>
      signal.affectedCapabilityIds.includes(capabilityId),
    );
    let routeMatch = (flow.routePatterns ?? []).some((routePattern) =>
      signal.message.includes(routePattern),
    );
    let nameMatch = tokenize(flow.name).some(
      (token) =>
        token.length >=
          deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() &&
        messageTokens.has(token),
    );
    if (capabilityMatch || routeMatch || nameMatch) {
      ids.add(flow.id);
    }
  }

  return Array.from(ids);
}

export function mapCapabilitiesFromFlows(
  signal: RuntimeSignal,
  flowProjection?: {
    flows?: Array<{ id: string; capabilityIds?: string[] }>;
  },
): string[] {
  if (!flowProjection?.flows) return [];
  return unique(
    flowProjection.flows
      .filter((flow) => signal.affectedFlowIds.includes(flow.id))
      .flatMap((flow) => flow.capabilityIds ?? []),
  );
}

// ─── Impact Score Computation ───────────────────────────────────────────────

/**
 * Compute an impact score (0..1) for a runtime signal based on observed load,
 * users, trend, and action semantics. Severity only contributes ordinal
 * pressure; it is not a fixed authority table.
 *
 * @param signal - The runtime signal to score.
 * @returns Impact score in the range 0..1.
 */
export function computeImpactScore(signal: RuntimeSignal): number {
  return deriveMagnitude(signal);
}

function deriveMagnitude(signal: RuntimeSignal): number {
  let levels: SignalSeverity[] = [...discoverSignalSeverityLabels()]
    .slice()
    .reverse() as SignalSeverity[];
  let ordinal = levels.indexOf(signal.severity);
  let ordinalForce =
    ordinal >= 0 ? (ordinal + deriveUnitValue()) / levels.length : signal.impactScore;
  let freqLog = Math.log10(Math.max(signal.frequency, deriveUnitValue()) + deriveUnitValue());
  let userLog = Math.log10(Math.max(signal.affectedUsers, deriveUnitValue()) + deriveUnitValue());
  let worseningLabel = [...TREND_LABELS].find((l) => l === 'worsening')!;
  let improvingLabel = [...TREND_LABELS].find((l) => l === 'improving')!;
  let trendForce =
    signal.trend === worseningLabel ? 0.2 : signal.trend === improvingLabel ? -0.1 : 0;
  let actionForce =
    signal.action === ACTION_BLOCK_DEPLOY ? 0.25 : signal.action === ACTION_BLOCK_MERGE ? 0.15 : 0;

  let observedMagnitude = (freqLog + userLog) / Math.max(freqLog + userLog, 12);
  let raw = observedMagnitude + ordinalForce * 0.2 + trendForce + actionForce;

  return bound01(raw);
}
