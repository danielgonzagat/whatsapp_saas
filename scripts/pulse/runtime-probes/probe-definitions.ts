import type { PulseRuntimeProbe } from '../types.convergence';

export interface RuntimeProbeDefinition {
  probeId: string;
  target: string;
  method: 'GET' | 'HEAD';
  path: string;
  required: boolean;
  expectedStatus: number;
  timeoutMs: number;
}

export const DEFAULT_PROBE_DEFINITIONS: RuntimeProbeDefinition[] = [
  {
    probeId: 'health-liveness',
    target: 'GET /health/liveness',
    method: 'GET',
    path: '/health/liveness',
    required: true,
    expectedStatus: 200,
    timeoutMs: 5000,
  },
  {
    probeId: 'health-ready',
    target: 'GET /health/ready',
    method: 'GET',
    path: '/health/ready',
    required: true,
    expectedStatus: 200,
    timeoutMs: 5000,
  },
  {
    probeId: 'kloel-health',
    target: 'GET /kloel/health',
    method: 'GET',
    path: '/kloel/health',
    required: false,
    expectedStatus: 200,
    timeoutMs: 5000,
  },
  {
    probeId: 'root-health',
    target: 'GET /health',
    method: 'GET',
    path: '/health',
    required: true,
    expectedStatus: 200,
    timeoutMs: 5000,
  },
];

export function resolveProbeBaseUrl(): string | null {
  if (process.env.PULSE_BACKEND_URL) return process.env.PULSE_BACKEND_URL.replace(/\/+$/, '');
  if (process.env.BACKEND_URL) return process.env.BACKEND_URL.replace(/\/+$/, '');
  if (process.env.PULSE_DISABLE_LOCAL_ENV) return null;
  return 'http://localhost:3001';
}

export function executeProbeSync(
  definition: RuntimeProbeDefinition,
  baseUrl: string,
): PulseRuntimeProbe {
  const { execSync } = require('node:child_process');
  const start = Date.now();
  const url = `${baseUrl}${definition.path}`;
  try {
    const stdout = execSync(
      `curl -s -o /dev/stdout -w '\\n%{http_code}' --max-time ${Math.ceil(definition.timeoutMs / 1000)} '${url}'`,
      { encoding: 'utf-8', timeout: definition.timeoutMs + 2000 },
    );
    const latencyMs = Date.now() - start;
    const lines = stdout.trim().split('\n');
    const httpStatus = parseInt(lines[lines.length - 1] ?? '0', 10);
    const body = lines.slice(0, -1).join('\n');
    const passed = httpStatus === definition.expectedStatus;
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = null;
    }
    return {
      probeId: definition.probeId,
      target: definition.target,
      required: definition.required,
      executed: true,
      status: passed ? 'passed' : 'failed',
      summary: passed
        ? `Probe ${definition.probeId} returned HTTP ${httpStatus} in ${latencyMs}ms`
        : `Probe ${definition.probeId} expected HTTP ${definition.expectedStatus}, got HTTP ${httpStatus}`,
      latencyMs,
      artifactPaths: ['PULSE_RUNTIME_EVIDENCE.json'],
      metrics: {
        httpStatus,
        ...(parsed && typeof parsed === 'object' ? { responseJson: true } : {}),
      },
    };
  } catch (error) {
    const latencyMs = Date.now() - start;
    const message = error instanceof Error ? error.message : String(error);
    const isTimeout = message.includes('ETIMEDOUT') || message.includes('killed');
    return {
      probeId: definition.probeId,
      target: definition.target,
      required: definition.required,
      executed: true,
      status: 'failed',
      summary: isTimeout
        ? `Probe ${definition.probeId} timed out after ${definition.timeoutMs}ms`
        : `Probe ${definition.probeId} connection error: ${message.slice(0, 200)}`,
      latencyMs,
      artifactPaths: ['PULSE_RUNTIME_EVIDENCE.json'],
      metrics: { error: message.slice(0, 300) },
    };
  }
}

export function executeAllProbesSync(
  baseUrl: string,
  definitions: RuntimeProbeDefinition[] = DEFAULT_PROBE_DEFINITIONS,
): PulseRuntimeProbe[] {
  return definitions.map((d) => executeProbeSync(d, baseUrl));
}
