import { discoverAllObservedArtifactFilenames } from '../../dynamic-reality-kernel/__parts__/token-evidence';
import type { PulseExternalSignalSource } from '../../types.capabilities';

interface PulseExternalSourceConfig {
  fileName: string;
  maxAgeMinutes: number;
}

/** Configuration and freshness thresholds for each snapshot-file-backed source. */
export const PULSE_EXTERNAL_SNAPSHOT_FILES: Record<
  Exclude<PulseExternalSignalSource, 'codacy'>,
  PulseExternalSourceConfig
> = {
  github: { fileName: 'PULSE_GITHUB_STATE.json', maxAgeMinutes: 6 * 60 },
  github_actions: { fileName: 'PULSE_GITHUB_ACTIONS_STATE.json', maxAgeMinutes: 6 * 60 },
  codecov: { fileName: 'PULSE_CODECOV_STATE.json', maxAgeMinutes: 24 * 60 },
  sentry: { fileName: 'PULSE_SENTRY_STATE.json', maxAgeMinutes: 6 * 60 },
  datadog: { fileName: 'PULSE_DATADOG_STATE.json', maxAgeMinutes: 6 * 60 },
  prometheus: { fileName: 'PULSE_PROMETHEUS_STATE.json', maxAgeMinutes: 30 },
  dependabot: { fileName: 'PULSE_DEPENDABOT_STATE.json', maxAgeMinutes: 24 * 60 },
  gitnexus: { fileName: 'PULSE_GITNEXUS_EVIDENCE.json', maxAgeMinutes: 24 * 60 },
};

/** List of all external input file names watched by the daemon. */
export const PULSE_EXTERNAL_INPUT_FILES = [
  discoverAllObservedArtifactFilenames().codacyState ?? 'PULSE_CODACY_STATE.json',
  ...Object.values(PULSE_EXTERNAL_SNAPSHOT_FILES).map((config) => config.fileName),
];
