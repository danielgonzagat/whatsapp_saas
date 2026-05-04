import 'jest';
import { createService } from '../../../test/pulse/pulse.service-test-helpers';

export async function testStaleOrganismState(artifactRootDir: string) {
  const { service } = createService({
    configGet: jest.fn((key: string) => (key === 'PULSE_ARTIFACT_ROOT' ? artifactRootDir : '')),
  });

  await expect(service.getOrganismState()).resolves.toMatchObject({
    status: 'STALE',
    authorityMode: 'advisory-only',
    circulation: {
      registeredNodes: 0,
      freshNodes: 0,
      staleNodes: 0,
    },
    advice: {
      level: 'watch',
    },
  });
}

export function testMissingCanonicalArtifacts(artifactRootDir: string) {
  const { service } = createService({
    configGet: jest.fn((key: string) => (key === 'PULSE_ARTIFACT_ROOT' ? artifactRootDir : '')),
  });

  expect(service.getProductionSnapshot()).toMatchObject({
    status: 'empty',
    authorityMode: 'advisory-only',
    machineReadiness: {
      status: 'unknown',
      authorityMode: 'advisory-only',
      autonomyVerdict: 'UNKNOWN',
      executionMatrixSummary: null,
    },
    missingArtifacts: expect.arrayContaining([
      'PULSE_CLI_DIRECTIVE.json',
      'PULSE_CERTIFICATE.json',
    ]),
  });
}
