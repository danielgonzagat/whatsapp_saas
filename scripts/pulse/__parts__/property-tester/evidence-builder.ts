import * as fs from 'node:fs';
import { safeJoin } from '../../lib/safe-path';
import { ensureDir } from '../../safe-fs';
import { scanForExistingPropertyTests, generatePropertyTestTargets } from './property-scan';
import { discoverEndpoints } from './endpoint-discovery';
import { generateFuzzCasesFromEndpoints } from './fuzz-generation';
import { computeMutationTargets } from './mutation-targets';
import { mergeAndDedupe, zeroValue, canonicalArtifactFilename } from './util';
import {
  discoverPropertyPassedStatusFromTypeEvidence,
  discoverPropertyUnexecutedStatusFromExecutionEvidence,
  discoverBoundaryStrategiesFromTypeEvidence,
} from '../../dynamic-reality-kernel';
import type { PropertyTestEvidence } from '../../types.property-tester';

import { generatePropertyTestCases } from './test-case-generation';

export function writePropertyEvidenceFile(
  evidence: PropertyTestEvidence,
  artifactDir: string,
): void {
  ensureDir(artifactDir, { recursive: true });
  let artifactPath = safeJoin(artifactDir, canonicalArtifactFilename());
  fs.writeFileSync(artifactPath, JSON.stringify(evidence, null, 2));
}

export function buildPropertyTestEvidence(
  rootDir: string,
  pulseDir?: string,
): PropertyTestEvidence {
  let evidenceDir = pulseDir ?? safeJoin(rootDir, '.pulse', 'current');

  let propertyTests = scanForExistingPropertyTests(rootDir);
  let propertyTargets = generatePropertyTestTargets();

  let allPropertyTests = mergeAndDedupe(propertyTests, propertyTargets);

  let endpoints = discoverEndpoints(rootDir);
  let fuzzTests = generateFuzzCasesFromEndpoints(endpoints);
  let mutationTests = computeMutationTargets(rootDir);
  let generatedTests = generatePropertyTestCases(rootDir);

  let totalProperty = allPropertyTests.length;
  let plannedProperty = allPropertyTests.filter((t) => t.status === 'planned').length;
  let notExecutedProperty = allPropertyTests.filter((t) => t.status === 'not_executed').length;
  let passedProperty = allPropertyTests.filter((t) => t.status === 'passed').length;
  let failedProperty = allPropertyTests.filter((t) => t.status === 'failed').length;
  let totalFuzz = fuzzTests.length;
  let plannedFuzz = fuzzTests.filter((t) => t.status === 'planned').length;
  let notExecutedFuzz = fuzzTests.filter((t) => t.status === 'not_executed').length;
  let passedFuzz = fuzzTests.filter((t) => t.status === 'passed').length;
  let failedFuzz = fuzzTests.filter((t) => t.status === 'failed').length;
  let totalMutation = mutationTests.length;
  let plannedMutation = mutationTests.filter((t) => t.status === 'planned').length;
  let notExecutedMutation = mutationTests.filter((t) => t.status === 'not_executed').length;
  let hasMutationEvidence = totalMutation > zeroValue();
  let avgMutationScore = hasMutationEvidence
    ? Math.round(
        mutationTests.reduce((sum, m) => sum + m.mutationScore, zeroValue()) / totalMutation,
      )
    : zeroValue();

  let capabilitiesCovered = new Set(
    allPropertyTests
      .filter((t) => discoverPropertyPassedStatusFromTypeEvidence().has(t.status))
      .map((t) => t.capabilityId)
      .filter(Boolean),
  );
  let criticalCapabilities = new Set(
    allPropertyTests
      .filter(
        (t) =>
          discoverPropertyPassedStatusFromTypeEvidence().has(t.status) &&
          discoverBoundaryStrategiesFromTypeEvidence().has(t.strategy),
      )
      .map((t) => t.capabilityId)
      .filter(Boolean),
  );
  let criticalCapabilitiesPlanned = new Set(
    allPropertyTests
      .filter(
        (t) =>
          discoverPropertyUnexecutedStatusFromExecutionEvidence().has(t.status) &&
          discoverBoundaryStrategiesFromTypeEvidence().has(t.strategy),
      )
      .map((t) => t.capabilityId)
      .filter(Boolean),
  );

  let evidence: PropertyTestEvidence = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalPropertyTests: totalProperty,
      plannedPropertyTests: plannedProperty,
      notExecutedPropertyTests: notExecutedProperty,
      passedPropertyTests: passedProperty,
      failedPropertyTests: failedProperty,
      totalFuzzTests: totalFuzz,
      plannedFuzzTests: plannedFuzz,
      notExecutedFuzzTests: notExecutedFuzz,
      passedFuzzTests: passedFuzz,
      failedFuzzTests: failedFuzz,
      totalMutationTests: totalMutation,
      plannedMutationTests: plannedMutation,
      notExecutedMutationTests: notExecutedMutation,
      averageMutationScore: avgMutationScore,
      capabilitiesCovered: capabilitiesCovered.size,
      criticalCapabilitiesCovered: criticalCapabilities.size,
      criticalCapabilitiesPlanned: criticalCapabilitiesPlanned.size,
      totalGeneratedTests: generatedTests.length,
      plannedGeneratedTests: generatedTests.filter((t) => t.status === 'planned').length,
    },
    propertyTests: allPropertyTests,
    fuzzTests,
    mutationTests,
    generatedTests,
  };

  let artifactPath = safeJoin(evidenceDir, canonicalArtifactFilename());
  ensureDir(evidenceDir, { recursive: true });
  fs.writeFileSync(artifactPath, JSON.stringify(evidence, null, 2));

  return evidence;
}
