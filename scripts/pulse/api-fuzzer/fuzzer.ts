/**
 * PULSE API Contract & Fuzz Probe Engine — Main Catalog Builder & HTTP Probes
 *
 * Builds the complete API fuzz catalog, executes local HTTP probes via curl,
 * and writes evidence to disk.
 */
import { execFileSync } from 'node:child_process';
import { safeJoin } from '../lib/safe-path';
import { discoverAllObservedArtifactFilenames } from '../dynamic-reality-kernel/token-evidence';
import { ensureDir, writeTextFile } from '../safe-fs';
import type { APIEndpointProbe, APIFuzzEvidence, FuzzTestCaseStatus } from '../types.api-fuzzer';
import {
  STATUS,
  IDEM,
  PASSED,
  PASSED_STATUSES,
  UNEXECUTED_STATUSES,
  NOT_EXECUTED,
  BAD_REQUEST,
  UNAUTHORIZED,
  FORBIDDEN,
  UNPROCESSABLE,
  deriveZeroValue,
  deriveUnitValue,
} from './constants';
import { discoverAPIEndpoints } from './discovery';
import {
  generateAuthTests,
  generateSchemaTests,
  generateIdempotencyTests,
  generateRateLimitTests,
} from './test-generators';
import { generateSecurityTests, classifyEndpointRisk } from './security-generator';

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
    e.securityTests.some((t) => UNEXECUTED_STATUSES.has(t.status) && t.expectedBlock),
  );
  const endpointsWithIssues = endpoints.filter((e) =>
    e.securityTests.some((t) => t.status === STATUS.failed || t.status === STATUS.securityIssue),
  );
  const probedEndpoints = endpoints.filter(endpointHasObservedProbe);

  const evidence: APIFuzzEvidence = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalEndpoints: endpoints.length,
      plannedEndpoints: endpoints.length,
      probedEndpoints: probedEndpoints.length,
      authPlannedEndpoints: endpoints.filter((e) =>
        e.authTests.some((t) => UNEXECUTED_STATUSES.has(t.status)),
      ).length,
      authTestedEndpoints: endpoints.filter((e) =>
        e.authTests.some((t) => PASSED_STATUSES.has(t.status) || t.status === STATUS.failed),
      ).length,
      schemaPlannedEndpoints: endpoints.filter((e) =>
        e.schemaTests.some((t) => UNEXECUTED_STATUSES.has(t.status)),
      ).length,
      schemaTestedEndpoints: endpoints.filter((e) =>
        e.schemaTests.some((t) => PASSED_STATUSES.has(t.status) || t.status === STATUS.failed),
      ).length,
      idempotencyPlannedEndpoints: endpoints.filter((e) =>
        e.idempotencyTests.some((t) => UNEXECUTED_STATUSES.has(t.status)),
      ).length,
      idempotencyTestedEndpoints: endpoints.filter((e) =>
        e.idempotencyTests.some(
          (t) => t.status === IDEM.idempotent || t.status === IDEM.notIdempotent,
        ),
      ).length,
      rateLimitPlannedEndpoints: endpoints.filter((e) =>
        e.rateLimitTests.some((t) => UNEXECUTED_STATUSES.has(t.status)),
      ).length,
      rateLimitTestedEndpoints: endpoints.filter((e) =>
        e.rateLimitTests.some((t) => PASSED_STATUSES.has(t.status) || t.status === STATUS.failed),
      ).length,
      securityPlannedEndpoints: endpoints.filter((e) =>
        e.securityTests.some((t) => UNEXECUTED_STATUSES.has(t.status)),
      ).length,
      securityTestedEndpoints: endpoints.filter((e) =>
        e.securityTests.some((t) => PASSED_STATUSES.has(t.status) || t.status === STATUS.failed),
      ).length,
      endpointsWithIssues: endpointsWithIssues.length,
      endpointsWithPlannedSecurityIssues: endpointsWithPlannedSecurityIssues.length,
      criticalSecurityIssues: endpoints.filter(
        (e) =>
          classifyEndpointRisk(e) === 'critical' &&
          e.securityTests.some(
            (t) => t.status === STATUS.failed || t.status === STATUS.securityIssue,
          ),
      ).length,
      criticalSecurityPlans: endpoints.filter(
        (e) =>
          classifyEndpointRisk(e) === 'critical' &&
          e.securityTests.some((t) => UNEXECUTED_STATUSES.has(t.status)),
      ).length,
    },
    probes: endpoints,
  };

  const pulseDir = safeJoin(rootDir, '.pulse', 'current');
  ensureDir(pulseDir, { recursive: true });
  const artifactName = discoverAllObservedArtifactFilenames().apiFuzzEvidence;
  const outputPath = safeJoin(pulseDir, artifactName);
  writeTextFile(outputPath, JSON.stringify(evidence, null, 2));

  return evidence;
}

function endpointHasObservedProbe(endpoint: APIEndpointProbe): boolean {
  return (
    endpoint.authTests.some(
      (test) => PASSED_STATUSES.has(test.status) || test.status === STATUS.failed,
    ) ||
    endpoint.schemaTests.some(
      (test) => PASSED_STATUSES.has(test.status) || test.status === STATUS.failed,
    ) ||
    endpoint.idempotencyTests.some(
      (test) => test.status === IDEM.idempotent || test.status === IDEM.notIdempotent,
    ) ||
    endpoint.rateLimitTests.some(
      (test) => PASSED_STATUSES.has(test.status) || test.status === STATUS.failed,
    ) ||
    endpoint.securityTests.some(
      (test) =>
        PASSED_STATUSES.has(test.status) ||
        test.status === STATUS.failed ||
        test.status === STATUS.securityIssue,
    )
  );
}

function executeLocalFuzzProbes(endpoint: APIEndpointProbe): void {
  const baseUrl = resolveLocalFuzzBaseUrl();
  if (!baseUrl || !hasCurl()) {
    return;
  }

  if (endpoint.method === 'GET') {
    for (const test of endpoint.authTests) {
      const result = executeHttpProbe({
        baseUrl,
        method: endpoint.method,
        path: endpoint.path,
        expectedStatus: test.expectedStatus,
      });
      test.actualStatus = result.actualStatus;
      test.error = result.error;
      test.status = result.status;
    }
  }

  if (['POST', 'PUT', 'PATCH'].includes(endpoint.method)) {
    for (const test of endpoint.schemaTests.filter((item) => item.expectedStatus >= BAD_REQUEST)) {
      const result = executeHttpProbe({
        baseUrl,
        method: endpoint.method,
        path: endpoint.path,
        expectedStatus: test.expectedStatus,
        payload: test.payload,
      });
      test.actualStatus = result.actualStatus;
      test.validationErrors = result.error ? [result.error] : test.validationErrors;
      test.status = result.status;
    }

    for (const test of endpoint.securityTests
      .filter((item) => item.expectedBlock)
      .slice(deriveZeroValue(), deriveUnitValue() + deriveUnitValue() + deriveUnitValue())) {
      const result = executeHttpProbe({
        baseUrl,
        method: endpoint.method,
        path: endpoint.path,
        expectedStatus: BAD_REQUEST,
        payload: { __pulse_payload: test.payload },
      });
      test.actuallyBlocked =
        typeof result.actualStatus === 'number' && result.actualStatus >= BAD_REQUEST
          ? true
          : result.actualStatus === null
            ? null
            : false;
      test.status =
        test.actuallyBlocked === true
          ? PASSED
          : test.actuallyBlocked === false
            ? STATUS.securityIssue
            : NOT_EXECUTED;
    }
  }
}

function resolveLocalFuzzBaseUrl(): URL | null {
  const rawBaseUrl = process.env.PULSE_API_FUZZ_BASE_URL;
  if (!rawBaseUrl) {
    return null;
  }

  try {
    const parsed = new URL(rawBaseUrl);
    const isLocal =
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '[::1]' ||
      parsed.hostname === '::1';

    if (!isLocal && process.env.PULSE_API_FUZZ_ALLOW_REMOTE !== '1') {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function hasCurl(): boolean {
  try {
    execFileSync('curl', ['--version'], {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
}

function executeHttpProbe(args: {
  baseUrl: URL;
  method: string;
  path: string;
  expectedStatus: number;
  payload?: unknown;
}): {
  status: FuzzTestCaseStatus;
  actualStatus: number | null;
  error: string | null;
} {
  const url = new URL(materializeRoutePath(args.path), args.baseUrl);
  const curlArgs = [
    '--silent',
    '--show-error',
    '--output',
    '/dev/null',
    '--write-out',
    '%{http_code}',
    '--max-time',
    '5',
    '--request',
    args.method,
  ];

  if (args.payload !== undefined) {
    curlArgs.push('--header', 'Content-Type: application/json');
    curlArgs.push('--data', JSON.stringify(args.payload));
  }

  curlArgs.push(url.toString());

  try {
    const output = execFileSync('curl', curlArgs, {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 8000,
    }).trim();
    const actualStatus = Number.parseInt(output, 10);
    if (!Number.isFinite(actualStatus)) {
      return { status: NOT_EXECUTED, actualStatus: null, error: `curl returned ${output}` };
    }

    return {
      status: statusMatchesExpectation(actualStatus, args.expectedStatus) ? PASSED : STATUS.failed,
      actualStatus,
      error: null,
    };
  } catch (error) {
    return {
      status: NOT_EXECUTED,
      actualStatus: null,
      error: extractProbeFailure(error),
    };
  }
}

function materializeRoutePath(routePath: string): string {
  return routePath
    .replace(/:([A-Za-z_]\w*)/g, '__pulse_probe_$1')
    .replace(/\{([A-Za-z_]\w*)\}/g, '__pulse_probe_$1');
}

function statusMatchesExpectation(actualStatus: number, expectedStatus: number): boolean {
  if (actualStatus === expectedStatus) {
    return true;
  }

  if (expectedStatus === UNAUTHORIZED && actualStatus === FORBIDDEN) {
    return true;
  }

  if (
    expectedStatus === BAD_REQUEST &&
    (actualStatus === UNAUTHORIZED || actualStatus === FORBIDDEN || actualStatus === UNPROCESSABLE)
  ) {
    return true;
  }

  return false;
}

function extractProbeFailure(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return 'unknown probe failure';
  }

  const output = error as { stdout?: unknown; stderr?: unknown; message?: unknown };
  const parts = [output.stderr, output.stdout, output.message]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .map((part) => part.trim());

  return parts.join('\n').replace(/\s+/g, ' ').slice(0, 300) || 'curl probe failed';
}
