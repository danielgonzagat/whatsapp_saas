import { safeJoin } from '../../lib/safe-path';
import { ensureDir, writeTextFile } from '../../safe-fs';
import type { APIFuzzEvidence } from '../../types.api-fuzzer';
import { discoverAPIEndpoints } from './discovery';
import { endpointHasObservedProbe, executeLocalFuzzProbes } from './probe-execution';
import { classifyEndpointRisk } from './risk-classification';
import {
  generateAuthTests,
  generateIdempotencyTests,
  generateRateLimitTests,
  generateSchemaTests,
  generateSecurityTests,
} from './test-generators';

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Build the complete API fuzz catalog.
 *
 * Discovers all NestJS endpoints in `backend/src`, classifies risk, and
 * generates comprehensive test catalogs for auth, schema validation,
 * idempotency, rate limiting, and security vulnerabilities.
 *
 * The resulting evidence is written to `.pulse/current/PULSE_API_FUZZ_EVIDENCE.json`
 * and returned in memory.
 *
 * @param rootDir The repository root directory.
 * @returns The complete API fuzz evidence object.
 */
export function buildAPIFuzzCatalog(rootDir: string): APIFuzzEvidence {
  const endpoints = discoverAPIEndpoints(rootDir);

  for (const endpoint of endpoints) {
    endpoint.authTests = generateAuthTests(endpoint);
    endpoint.schemaTests = generateSchemaTests(endpoint, rootDir);
    endpoint.idempotencyTests = generateIdempotencyTests(endpoint);
    endpoint.rateLimitTests = generateRateLimitTests(endpoint);
    endpoint.securityTests = generateSecurityTests(endpoint);
    executeLocalFuzzProbes(endpoint);
  }

  const endpointsWithPlannedSecurityIssues = endpoints.filter((e) =>
    e.securityTests.some((t) => t.status === 'planned' && t.expectedBlock),
  );
  const endpointsWithIssues = endpoints.filter((e) =>
    e.securityTests.some((t) => t.status === 'failed' || t.status === 'security_issue'),
  );
  const probedEndpoints = endpoints.filter(endpointHasObservedProbe);

  const evidence: APIFuzzEvidence = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalEndpoints: endpoints.length,
      plannedEndpoints: endpoints.length,
      probedEndpoints: probedEndpoints.length,
      authPlannedEndpoints: endpoints.filter((e) => e.authTests.some((t) => t.status === 'planned'))
        .length,
      authTestedEndpoints: endpoints.filter((e) =>
        e.authTests.some((t) => t.status === 'passed' || t.status === 'failed'),
      ).length,
      schemaPlannedEndpoints: endpoints.filter((e) =>
        e.schemaTests.some((t) => t.status === 'planned'),
      ).length,
      schemaTestedEndpoints: endpoints.filter((e) =>
        e.schemaTests.some((t) => t.status === 'passed' || t.status === 'failed'),
      ).length,
      idempotencyPlannedEndpoints: endpoints.filter((e) =>
        e.idempotencyTests.some((t) => t.status === 'planned'),
      ).length,
      idempotencyTestedEndpoints: endpoints.filter((e) =>
        e.idempotencyTests.some((t) => t.status === 'idempotent' || t.status === 'not_idempotent'),
      ).length,
      rateLimitPlannedEndpoints: endpoints.filter((e) =>
        e.rateLimitTests.some((t) => t.status === 'planned'),
      ).length,
      rateLimitTestedEndpoints: endpoints.filter((e) =>
        e.rateLimitTests.some((t) => t.status === 'passed' || t.status === 'failed'),
      ).length,
      securityPlannedEndpoints: endpoints.filter((e) =>
        e.securityTests.some((t) => t.status === 'planned'),
      ).length,
      securityTestedEndpoints: endpoints.filter((e) =>
        e.securityTests.some((t) => t.status === 'passed' || t.status === 'failed'),
      ).length,
      endpointsWithIssues: endpointsWithIssues.length,
      endpointsWithPlannedSecurityIssues: endpointsWithPlannedSecurityIssues.length,
      criticalSecurityIssues: endpoints.filter(
        (e) =>
          classifyEndpointRisk(e) === 'critical' &&
          e.securityTests.some((t) => t.status === 'failed' || t.status === 'security_issue'),
      ).length,
      criticalSecurityPlans: endpoints.filter(
        (e) =>
          classifyEndpointRisk(e) === 'critical' &&
          e.securityTests.some((t) => t.status === 'planned'),
      ).length,
    },
    probes: endpoints,
  };

  const pulseDir = safeJoin(rootDir, '.pulse', 'current');
  ensureDir(pulseDir, { recursive: true });
  const outputPath = safeJoin(pulseDir, 'PULSE_API_FUZZ_EVIDENCE.json');
  writeTextFile(outputPath, JSON.stringify(evidence, null, 2));

  return evidence;
}
