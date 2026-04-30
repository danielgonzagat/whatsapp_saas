/** Normalize a persisted runtime probes artifact or a legacy probes array. */
export function normalizeRuntimeProbesArtifact(
  raw: unknown,
  options: BuildRuntimeProbesArtifactOptions = {},
): PulseRuntimeProbesArtifact | null {
  if (Array.isArray(raw)) {
    return artifactFromRecord(
      {
        generatedAt: options.generatedAt ?? new Date().toISOString(),
        source: options.source ?? 'legacy',
        executed: raw.some((entry) => isRecord(entry) && entry.executed === true),
        summary: 'Legacy runtime probes array normalized into a self-describing artifact.',
        artifactPaths: [RUNTIME_PROBES_PATH],
        probes: raw,
      },
      options.source ? options : { ...options, source: 'legacy' },
    );
  }
  if (!isRecord(raw)) {
    return null;
  }
  return artifactFromRecord(raw, options);
}

/** Whether a normalized probe can be counted by production proof. */
export function isRuntimeProbeProofEligible(probe: PulseRuntimeProbeArtifactProbe): boolean {
  return probe.proofEligible;
}

