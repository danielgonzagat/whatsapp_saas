import type {
  PulseCertificationProfile,
  PulseExternalAdapterProofBasis,
  PulseExternalAdapterRequirement,
  PulseExternalAdapterStatus,
} from '../../../types';
import {
  getAdapterRequiredness,
  type ConsolidatedExternalSource,
  type ExternalSourceCapabilityMetadata,
  type ExternalSourceRunResult,
} from './types';

function buildLiveMissingReason(
  entry: ExternalSourceRunResult,
  required: boolean,
  proofBasis: PulseExternalAdapterProofBasis,
  profile: PulseCertificationProfile | undefined,
  sourceCapability: ExternalSourceCapabilityMetadata,
): string | null {
  if (
    entry.status !== 'not_available' &&
    entry.status !== 'invalid' &&
    entry.status !== 'stale' &&
    entry.status !== 'optional_not_configured'
  ) {
    return null;
  }

  const profileLabel = profile || 'default';
  const requirementLabel = required ? 'required' : 'optional';
  const disposition = required ? 'blocking external proof closure' : 'tracked as non-blocking';
  return `${entry.source} is ${requirementLabel} under profile=${profileLabel}; proofBasis=${proofBasis}; status=${entry.status}; sourceCapability=${sourceCapability.truthAuthority}; operational=${sourceCapability.operational}; ${disposition}. ${entry.reason}`;
}

export function classifyLiveExternalSource(
  entry: ExternalSourceRunResult,
  profile: PulseCertificationProfile | undefined,
  sourceCapability: ExternalSourceCapabilityMetadata,
): ConsolidatedExternalSource {
  const required = sourceCapability.discovered;
  const status: PulseExternalAdapterStatus =
    entry.status === 'not_available' && !sourceCapability.discovered
      ? 'optional_not_configured'
      : entry.status;
  const proofBasis: PulseExternalAdapterProofBasis = 'live_adapter';
  const requirement: PulseExternalAdapterRequirement = required ? 'required' : 'optional';
  const profileLabel = profile || 'default';
  const classifiedEntry = {
    ...entry,
    status,
    reason:
      entry.status === 'not_available' && !sourceCapability.discovered
        ? `${entry.source} adapter has no discovered repo/CI/env/tool capability under profile=${profileLabel}; compat requiredness ${sourceCapability.compatRequiredness} is metadata only.`
        : entry.reason,
    requiredness: getAdapterRequiredness(entry.source),
    requirement,
    required,
    blocking:
      required && (status === 'not_available' || status === 'invalid' || status === 'stale'),
    proofBasis,
    sourceCapability,
  };

  return {
    ...classifiedEntry,
    missingReason: buildLiveMissingReason(
      classifiedEntry,
      required,
      proofBasis,
      profile,
      sourceCapability,
    ),
  };
}
