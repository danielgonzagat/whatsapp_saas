import type { ConsolidatedExternalState } from '../adapters/external-sources-orchestrator';
import type { PulseCertificationProfile } from '../types';

/** Build an empty live-state envelope that carries active profile/scope semantics. */
export function createExternalSignalProfileState(
  profile: PulseCertificationProfile | null | undefined,
  certificationScope: PulseCertificationProfile | null | undefined = profile,
): ConsolidatedExternalState {
  const generatedAt = new Date().toISOString();
  return {
    generatedAt,
    profile: profile || undefined,
    certificationScope: certificationScope || profile || undefined,
    sources: [],
    sourceCapabilities: [],
    allSignals: [],
    signalsBySource: {},
    criticalSignals: [],
    highSignals: [],
    totalSeverity: 0,
  };
}
