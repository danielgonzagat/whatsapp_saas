export async function runFrontendProbe(
  context: RuntimeProbeContext,
): Promise<PulseRuntimeProbeResult> {
  const start = Date.now();
  if (context.env === 'total' && shouldTreatAsMissingEvidence(context.frontendSource)) {
    return {
      probeId: 'frontend-reachability',
      target: context.frontendUrl,
      required: true,
      executed: false,
      status: 'missing_evidence',
      failureClass: 'missing_evidence',
      summary: `Frontend runtime resolution is still fallback-only (${context.frontendUrl}); refusing localhost fallback during total certification.`,
      latencyMs: Date.now() - start,
      artifactPaths: PROBE_ARTIFACT_PATHS,
    };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(context.frontendUrl, { method: 'GET', signal: controller.signal });
    return {
      probeId: 'frontend-reachability',
      target: context.frontendUrl,
      required: context.env === 'total',
      executed: true,
      status: res.status < 500 ? 'passed' : 'failed',
      failureClass: res.status < 500 ? undefined : 'product_failure',
      summary:
        res.status < 500
          ? `Frontend responded with HTTP ${res.status}.`
          : `Frontend returned HTTP ${res.status}.`,
      latencyMs: Date.now() - start,
      artifactPaths: PROBE_ARTIFACT_PATHS,
      metrics: {
        status: res.status,
      },
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'connection failed';
    const failureClass = shouldTreatAsMissingEvidence(context.frontendSource)
      ? 'missing_evidence'
      : 'product_failure';
    return {
      probeId: 'frontend-reachability',
      target: context.frontendUrl,
      required: context.env === 'total',
      executed: false,
      status: failureClass === 'missing_evidence' ? 'missing_evidence' : 'failed',
      failureClass,
      summary: compactReason(`Frontend probe failed: ${message}`),
      latencyMs: Date.now() - start,
      artifactPaths: PROBE_ARTIFACT_PATHS,
    };
  } finally {
    clearTimeout(timer);
  }
}

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
      status: 'passed',
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
    if (fallbackProbe.status === 'passed') {
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

