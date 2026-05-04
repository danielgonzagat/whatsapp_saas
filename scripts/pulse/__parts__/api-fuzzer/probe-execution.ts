import { execFileSync } from 'node:child_process';
import type { APIEndpointProbe, FuzzTestCaseStatus } from '../../types.api-fuzzer';

export function endpointHasObservedProbe(endpoint: APIEndpointProbe): boolean {
  return (
    endpoint.authTests.some((test) => test.status === 'passed' || test.status === 'failed') ||
    endpoint.schemaTests.some((test) => test.status === 'passed' || test.status === 'failed') ||
    endpoint.idempotencyTests.some(
      (test) => test.status === 'idempotent' || test.status === 'not_idempotent',
    ) ||
    endpoint.rateLimitTests.some((test) => test.status === 'passed' || test.status === 'failed') ||
    endpoint.securityTests.some(
      (test) =>
        test.status === 'passed' || test.status === 'failed' || test.status === 'security_issue',
    )
  );
}

export function executeLocalFuzzProbes(endpoint: APIEndpointProbe): void {
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
    for (const test of endpoint.schemaTests.filter((item) => item.expectedStatus >= 400)) {
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

    for (const test of endpoint.securityTests.filter((item) => item.expectedBlock).slice(0, 3)) {
      const result = executeHttpProbe({
        baseUrl,
        method: endpoint.method,
        path: endpoint.path,
        expectedStatus: 400,
        payload: { __pulse_payload: test.payload },
      });
      test.actuallyBlocked =
        typeof result.actualStatus === 'number' && result.actualStatus >= 400
          ? true
          : result.actualStatus === null
            ? null
            : false;
      test.status =
        test.actuallyBlocked === true
          ? 'passed'
          : test.actuallyBlocked === false
            ? 'security_issue'
            : 'not_executed';
    }
  }
}

export function resolveLocalFuzzBaseUrl(): URL | null {
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

export function hasCurl(): boolean {
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

export function executeHttpProbe(args: {
  baseUrl: URL;
  method: string;
  path: string;
  expectedStatus: number;
  payload?: unknown;
}): {
  status: Extract<FuzzTestCaseStatus, 'passed' | 'failed' | 'not_executed'>;
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
      return { status: 'not_executed', actualStatus: null, error: `curl returned ${output}` };
    }

    return {
      status: statusMatchesExpectation(actualStatus, args.expectedStatus) ? 'passed' : 'failed',
      actualStatus,
      error: null,
    };
  } catch (error) {
    return {
      status: 'not_executed',
      actualStatus: null,
      error: extractProbeFailure(error),
    };
  }
}

export function materializeRoutePath(routePath: string): string {
  return routePath
    .replace(/:([A-Za-z_]\w*)/g, '__pulse_probe_$1')
    .replace(/\{([A-Za-z_]\w*)\}/g, '__pulse_probe_$1');
}

export function statusMatchesExpectation(actualStatus: number, expectedStatus: number): boolean {
  if (actualStatus === expectedStatus) {
    return true;
  }

  if (expectedStatus === 401 && actualStatus === 403) {
    return true;
  }

  if (
    expectedStatus === 400 &&
    (actualStatus === 401 || actualStatus === 403 || actualStatus === 422)
  ) {
    return true;
  }

  return false;
}

export function extractProbeFailure(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return 'unknown probe failure';
  }

  const output = error as { stdout?: unknown; stderr?: unknown; message?: unknown };
  const parts = [output.stderr, output.stdout, output.message]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .map((part) => part.trim());

  return parts.join('\n').replace(/\s+/g, ' ').slice(0, 300) || 'curl probe failed';
}
