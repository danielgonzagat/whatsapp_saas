/**
 * Directive artifact-index builder.
 * Exports: buildArtifactIndex
 */
import { normalizeCanonicalArtifactValue } from '../artifacts.queue';
import { deriveAuthorityState } from '../artifacts.autonomy/authority';
import type { PulseArtifactCleanupReport } from '../artifact-gc';
import type { PulseArtifactRegistry } from '../artifact-registry/discovery';
import type { PulseRunIdentity } from '../run-identity';
import type { PulseMachineReadiness } from '../artifacts.autonomy/types';
import { artifactJsonReplacer } from './directive-shared';

export function buildArtifactIndex(
  registry: PulseArtifactRegistry,
  cleanupReport: PulseArtifactCleanupReport,
  authority: ReturnType<typeof deriveAuthorityState>,
  identity?: PulseRunIdentity,
  pulseMachineReadiness?: PulseMachineReadiness,
): string {
  return JSON.stringify(
    normalizeCanonicalArtifactValue({
      runId: identity?.runId ?? registry.runId ?? null,
      generatedAt: identity?.generatedAt ?? new Date().toISOString(),
      authorityMode: authority.mode,
      advisoryOnly: authority.advisoryOnly,
      authorityReasons: authority.reasons,
      pulseMachineReadiness: pulseMachineReadiness
        ? {
            status: pulseMachineReadiness.status,
            scope: (pulseMachineReadiness as PulseMachineReadiness & { scope?: string }).scope,
            canRunBoundedAutonomousCycle: (
              pulseMachineReadiness as PulseMachineReadiness & {
                canRunBoundedAutonomousCycle?: boolean;
              }
            ).canRunBoundedAutonomousCycle,
            canDeclareKloelProductCertified: (
              pulseMachineReadiness as PulseMachineReadiness & {
                canDeclareKloelProductCertified?: boolean;
              }
            ).canDeclareKloelProductCertified,
            blockers: pulseMachineReadiness.blockers.slice(0, 12),
          }
        : null,
      cleanupPolicy: cleanupReport.cleanupMode,
      canonicalDir: registry.canonicalDir,
      tempDir: registry.tempDir,
      officialArtifacts: registry.artifacts.map((artifact) => artifact.relativePath).sort(),
      officialArtifactMetadata: registry.artifacts
        .map((artifact) => ({
          id: artifact.id,
          relativePath: artifact.relativePath,
          schema: artifact.schema,
          producer: artifact.producer,
          consumers: artifact.consumers,
          freshness: artifact.freshness,
          truthMode: artifact.truthMode,
          mirrorToRoot: artifact.mirrorToRoot === true,
        }))
        .sort((left, right) => left.relativePath.localeCompare(right.relativePath)),
      compatibilityMirrors: registry.mirrors,
      removedLegacyPulseArtifacts: cleanupReport.removedLegacyPulseArtifacts,
      rootStateMode: 'local-only',
    }),
    artifactJsonReplacer,
    2,
  );
}
