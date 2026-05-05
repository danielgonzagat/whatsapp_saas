/**
 * Pulse database connectivity probe.
 */
import { dbQuery } from '../parsers/runtime-utils';
import { compactReason, runDbReadbackFallback } from '../runtime-evidence.db-probe';
import type { PulseRuntimeProbeResult, RuntimeProbeContext } from '../runtime-evidence.db-probe';
import { PROBE_ARTIFACT_PATHS, probeStatusPassed } from './helpers';

export async function runDbProbe(
  context: RuntimeProbeContext,
  required: boolean,
): Promise<PulseRuntimeProbeResult> {
  if (!context.dbConfigured) {
    return runDbReadbackFallback(
      context,
      required,
      'No direct DATABASE_URL was resolved for this environment.',
    );
  }
  const start = Date.now();
  try {
    const rows = await dbQuery('SELECT 1 AS pulse_runtime_probe');
    return {
      probeId: 'db-connectivity',
      target: context.dbSource,
      required,
      executed: true,
      status: probeStatusPassed(),
      summary: 'Database connectivity probe succeeded.',
      latencyMs: Date.now() - start,
      artifactPaths: PROBE_ARTIFACT_PATHS,
      metrics: {
        rows: rows.length,
      },
    };
  } catch (error: unknown) {
    const message = String(error instanceof Error ? error.message : 'query failed');
    const directProbeFailure = compactReason(`Direct SQL probe failed: ${message}`);
    const fallbackProbe = await runDbReadbackFallback(context, required, directProbeFailure);
    if (fallbackProbe.status === probeStatusPassed()) {
      return {
        ...fallbackProbe,
        latencyMs: Date.now() - start,
      };
    }
    return {
      ...fallbackProbe,
      target: fallbackProbe.target || context.dbSource,
      latencyMs: Date.now() - start,
    };
  }
}
