import { buildArtifactIndex } from '../artifacts.directive/directive-index';
import { buildCertificate } from '../artifacts.report/certificate-build';
import { buildPulseMachineReadiness } from '../artifacts.report/machine-readiness';
import { buildReport } from '../artifacts.report/report-build';
import { refreshProofReadinessArtifact } from '../proof-readiness-artifact';
import type { PulseArtifactRegistry } from '../artifact-registry/discovery';
import type { PulseRunIdentity } from '../run-identity';
type RegisteredArtifactWriter = (
  artifactId: string,
  content: string,
  identity?: PulseRunIdentity,
) => string;
export function refreshSelfTrustArtifacts(params: {
  readonly rootDir: string;
  readonly registry: PulseArtifactRegistry;
  readonly cleanupReport: Parameters<typeof buildReport>[2];
  readonly authority: Parameters<typeof buildArtifactIndex>[2];
  readonly identity: PulseRunIdentity;
  readonly indent: number;
  readonly snapshotWithNoHardcodedRealityState: Parameters<typeof buildPulseMachineReadiness>[0];
  readonly convergencePlan: Parameters<typeof buildPulseMachineReadiness>[1];
  readonly previousAutonomyState: Parameters<typeof buildPulseMachineReadiness>[2];
  readonly writeRegisteredArtifact: RegisteredArtifactWriter;
}): void {
  refreshProofReadinessArtifact(params.rootDir, { generatedAt: params.identity.generatedAt });
  const machineReadinessWithSelfTrust = buildPulseMachineReadiness(
    params.snapshotWithNoHardcodedRealityState,
    params.convergencePlan,
    params.previousAutonomyState,
  );
  params.writeRegisteredArtifact(
    'certificate',
    buildCertificate(
      params.snapshotWithNoHardcodedRealityState,
      params.convergencePlan,
      params.previousAutonomyState,
    ),
    params.identity,
  );
  params.writeRegisteredArtifact(
    'machine-readiness',
    JSON.stringify(machineReadinessWithSelfTrust, null, params.indent),
    params.identity,
  );
  params.writeRegisteredArtifact(
    'report',
    buildReport(
      params.snapshotWithNoHardcodedRealityState,
      params.convergencePlan,
      params.cleanupReport,
      params.previousAutonomyState,
    ),
  );
  params.writeRegisteredArtifact(
    'artifact-index',
    buildArtifactIndex(
      params.registry,
      params.cleanupReport,
      params.authority,
      params.identity,
      machineReadinessWithSelfTrust as unknown as Parameters<typeof buildArtifactIndex>[4],
    ),
    params.identity,
  );
}
