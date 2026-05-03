// ─── Mapping Signals to Capabilities ────────────────────────────────────────

import { tokenize, unique } from '../../signal-normalizers';
import { normalizePathSeparators } from './json-parsing';
import type { RuntimeSignal } from '../../types.runtime-fusion';

/**
 * Map a runtime signal to capability IDs using file path matching and
 * message pattern matching against capability names.
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

      let hasNameMatch = nameTokens.some((nt) => nt.length >= 3 && messageTokens.has(nt));

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
      (token) => token.length >= 4 && messageTokens.has(token),
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

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}
