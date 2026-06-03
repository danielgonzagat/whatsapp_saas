import type { PulseRuntimeProbe } from '../types.convergence';
import {
  DEFAULT_PROBE_DEFINITIONS,
  resolveProbeBaseUrl,
  executeAllProbesSync,
  type RuntimeProbeDefinition,
} from './probe-definitions';

export type { RuntimeProbeDefinition };
export { DEFAULT_PROBE_DEFINITIONS, resolveProbeBaseUrl };

export interface RuntimeProbeSummary {
  total: number;
  executed: number;
  passed: number;
  failed: number;
  coveragePercent: number;
  probes: PulseRuntimeProbe[];
}

export function computeProbeSummary(probes: PulseRuntimeProbe[]): RuntimeProbeSummary {
  const executed = probes.filter((p) => p.executed).length;
  const passed = probes.filter((p) => p.status === 'passed').length;
  const failed = probes.filter((p) => p.status === 'failed').length;
  return {
    total: probes.length,
    executed,
    passed,
    failed,
    coveragePercent: probes.length > 0 ? Math.round((executed / probes.length) * 100) : 0,
    probes,
  };
}

export function collectRuntimeProbes(
  definitions?: RuntimeProbeDefinition[],
): PulseRuntimeProbe[] {
  const baseUrl = resolveProbeBaseUrl();
  if (!baseUrl) {
    return (definitions ?? DEFAULT_PROBE_DEFINITIONS).map(
      (def): PulseRuntimeProbe => ({
        probeId: def.probeId,
        target: def.target,
        required: def.required,
        executed: false,
        status: 'skipped',
        summary: 'No backend URL configured. Set PULSE_BACKEND_URL or BACKEND_URL.',
        artifactPaths: ['PULSE_RUNTIME_EVIDENCE.json'],
      }),
    );
  }
  return executeAllProbesSync(baseUrl, definitions ?? DEFAULT_PROBE_DEFINITIONS);
}
