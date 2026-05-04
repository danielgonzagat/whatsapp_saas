/**
 * Pulse runtime probe runners.
 * Individual probe implementations used by collectRuntimeEvidence.
 * DB readback fallback probe lives in runtime-evidence.db-probe.ts.
 */
import * as fs from 'fs';
import * as path from 'path';
import { obtainAuthToken } from './browser-stress-tester/auth';
import { dbQuery, httpGet } from './parsers/runtime-utils';
import {
  runDbReadbackFallback,
  shouldTreatAsMissingEvidence,
  compactReason,
} from './runtime-evidence.db-probe';
import {
  deriveUnitValue,
  deriveZeroValue,
  discoverAllObservedArtifactFilenames,
  discoverDirectorySkipHintsFromEvidence,
  discoverGateFailureClassLabels,
  discoverRuntimeProbeStatusLabels,
  discoverSourceExtensionsFromObservedTypescript,
} from './dynamic-reality-kernel';
import type { RuntimeProbeContext, PulseRuntimeProbeResult } from './runtime-evidence.db-probe';

export { runDbReadbackFallback, shouldTreatAsMissingEvidence } from './runtime-evidence.db-probe';
export type { RuntimeProbeContext, PulseRuntimeProbeResult } from './runtime-evidence.db-probe';

function getRuntimeEvidencePath(): string {
  return discoverAllObservedArtifactFilenames().runtimeEvidence || 'PULSE_RUNTIME_EVIDENCE.json';
}
function getRuntimeProbesPath(): string {
  return discoverAllObservedArtifactFilenames().runtimeProbes || 'PULSE_RUNTIME_PROBES.json';
}
const RUNTIME_EVIDENCE_PATH = getRuntimeEvidencePath();
const RUNTIME_PROBES_PATH = getRuntimeProbesPath();
const PROBE_ARTIFACT_PATHS = [RUNTIME_EVIDENCE_PATH, RUNTIME_PROBES_PATH];

function probeStatusFailed(): string {
  return [...discoverRuntimeProbeStatusLabels()].sort()[deriveZeroValue()];
}
function probeStatusMissingEvidence(): string {
  return [...discoverRuntimeProbeStatusLabels()].sort()[deriveUnitValue()];
}
function probeStatusPassed(): string {
  return [...discoverRuntimeProbeStatusLabels()].sort()[deriveUnitValue() + deriveUnitValue()];
}
function failureClassMissingEvidence(): string {
  return [...discoverGateFailureClassLabels()].sort()[deriveUnitValue()];
}
function failureClassProductFailure(): string {
  return [...discoverGateFailureClassLabels()].sort()[deriveUnitValue() + deriveUnitValue()];
}
function isMissingEvidenceFailure(fc: string): boolean {
  return failureClassMissingEvidence() === fc;
}

interface DiscoveredHttpRoute {
  method: string;
  path: string;
  file: string;
  guarded: boolean;
}

function normalizeRoutePath(routePath: string): string {
  const normalized = routePath
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('/');
  return `/${normalized}`;
}

function listTypeScriptFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return discoverDirectorySkipHintsFromEvidence().has(entry.name)
        ? []
        : listTypeScriptFiles(fullPath);
    }
    return entry.isFile() && discoverSourceExtensionsFromObservedTypescript().has(path.extname(entry.name)) && !entry.name.endsWith('.spec.ts')
      ? [fullPath]
      : [];
  });
}

function readOptionalText(filePath: string): string {
  try {
    return fs.readFileSync(filePath).toString();
  } catch {
    return '';
  }
}

function parseDecoratorPath(source: string, decoratorName: string): string | null {
  const decoratorIndex = source.indexOf(`@${decoratorName}`);
  if (decoratorIndex === -1) {
    return null;
  }
  const openParen = source.indexOf('(', decoratorIndex);
  const closeParen = openParen === -1 ? -1 : source.indexOf(')', openParen);
  if (openParen === -1 || closeParen === -1) {
    return '';
  }
  const rawArgument = source.slice(openParen + 1, closeParen).trim();
  const quoted = /^['"`]([^'"`]*)['"`]$/.exec(rawArgument);
  return quoted?.[1] ?? '';
}

function discoverBackendRoutes(rootDir: string = process.cwd()): DiscoveredHttpRoute[] {
  const backendSourceDir = path.join(rootDir, 'backend', 'src');
  const methodDecorators = new Map([
    ['Get', 'GET'],
    ['Post', 'POST'],
    ['Put', 'PUT'],
    ['Patch', 'PATCH'],
    ['Delete', 'DELETE'],
  ]);
  const routes: DiscoveredHttpRoute[] = [];

  for (const file of listTypeScriptFiles(backendSourceDir)) {
    const source = readOptionalText(file);
    const controllerBase = parseDecoratorPath(source, 'Controller');
    if (controllerBase === null) {
      continue;
    }
    const guarded = source.includes('@UseGuards') || source.includes('Guard)');
    const lines = source.split('\n');
    for (const line of lines) {
      for (const [decoratorName, method] of methodDecorators) {
        const routePart = parseDecoratorPath(line, decoratorName);
        if (routePart === null) {
          continue;
        }
        routes.push({
          method,
          path: normalizeRoutePath([controllerBase, routePart].filter(Boolean).join('/')),
          file,
          guarded,
        });
      }
    }
  }

  return routes;
}

function routeLooksLikeHealthCapability(route: DiscoveredHttpRoute): boolean {
  const evidence = `${route.path} ${path.basename(route.file)}`.toLowerCase();
  return route.method === 'GET' && (evidence.includes('health') || evidence.includes('ping'));
}

function routeLooksUsableAfterAuth(route: DiscoveredHttpRoute): boolean {
  return route.method === 'GET' && route.guarded && !routeLooksLikeHealthCapability(route);
}

function selectHealthProbePaths(): string[] {
  return discoverBackendRoutes()
    .filter(routeLooksLikeHealthCapability)
    .map((route) => route.path)
    .sort((left, right) => left.length - right.length);
}

function selectAuthenticatedReadPaths(): string[] {
  const routes = discoverBackendRoutes()
    .filter(routeLooksUsableAfterAuth)
    .map((route) => route.path)
    .filter((routePath) => !routePath.includes(':'))
    .sort((left, right) => left.length - right.length);
  return [...new Set(routes)];
}

export async function runBackendHealthProbe(
  context: RuntimeProbeContext,
): Promise<PulseRuntimeProbeResult> {
  const healthProbePaths = selectHealthProbePaths();
  const targetPath = healthProbePaths[0] ?? '';
  if (shouldTreatAsMissingEvidence(context.backendSource)) {
    return {
      probeId: 'backend-health',
      target: targetPath ? `${context.backendUrl}${targetPath}` : context.backendUrl,
      required: true,
      executed: false,
      status: probeStatusMissingEvidence(),
      failureClass: failureClassMissingEvidence(),
      summary: `Backend runtime resolution is still fallback-only (${context.backendUrl}); refusing to certify a fake target.`,
      artifactPaths: PROBE_ARTIFACT_PATHS,
    };
  }
  if (healthProbePaths.length === 0) {
    return {
      probeId: 'backend-health',
      target: context.backendUrl,
      required: true,
      executed: false,
      status: probeStatusMissingEvidence(),
      failureClass: failureClassMissingEvidence(),
      summary: 'No backend health capability route was discovered from controller entrypoints.',
      artifactPaths: PROBE_ARTIFACT_PATHS,
    };
  }
  const start = Date.now();
  for (const probePath of healthProbePaths) {
    const res = await httpGet(probePath, { timeout: 8000 });
    const latencyMs = Date.now() - start;
    const traceHeader = res.headers['x-request-id'] || res.headers['x-correlation-id'] || '';
    if (res.ok) {
      return {
        probeId: 'backend-health',
        target: `${context.backendUrl}${probePath}`,
        required: true,
        executed: true,
        status: probeStatusPassed(),
        summary: `Backend health probe passed on ${probePath} (${res.status}).`,
        latencyMs,
        artifactPaths: PROBE_ARTIFACT_PATHS,
        metrics: {
          status: res.status,
          traceHeaderDetected: Boolean(traceHeader),
        },
      };
    }
  }
  const fallbackFailureClass = shouldTreatAsMissingEvidence(context.backendSource)
    ? failureClassMissingEvidence()
    : failureClassProductFailure();
  const failingRes = await httpGet(targetPath, { timeout: 4000 });
  return {
    probeId: 'backend-health',
    target: `${context.backendUrl}${targetPath}`,
    required: true,
      executed: failingRes.status > deriveZeroValue(),
    status: fallbackFailureClass === failureClassMissingEvidence() ? probeStatusMissingEvidence() : probeStatusFailed(),
    failureClass: fallbackFailureClass,
    summary: compactReason(
      failingRes.status === deriveZeroValue()
        ? `Backend health probe could not reach ${context.backendUrl}. ${failingRes.body?.error || 'Connection failed'}.`
        : `Backend health probe returned HTTP ${failingRes.status} from ${context.backendUrl}${targetPath}.`,
    ),
    latencyMs: failingRes.timeMs,
    artifactPaths: [RUNTIME_EVIDENCE_PATH, RUNTIME_PROBES_PATH],
  };
}

export async function runAuthProbe(context: RuntimeProbeContext): Promise<PulseRuntimeProbeResult> {
  const start = Date.now();
  if (shouldTreatAsMissingEvidence(context.backendSource)) {
    return {
      probeId: 'auth-session',
      target: `${context.backendUrl}/auth/login`,
      required: true,
      executed: false,
      status: probeStatusMissingEvidence(),
      failureClass: failureClassMissingEvidence(),
      summary: `Backend runtime resolution is still fallback-only (${context.backendUrl}); auth proof cannot run honestly.`,
      latencyMs: Date.now() - start,
      artifactPaths: PROBE_ARTIFACT_PATHS,
    };
  }
  try {
    const creds = await obtainAuthToken(context.backendUrl);
    const authReadPaths = selectAuthenticatedReadPaths();
    if (authReadPaths.length === 0) {
      return {
        probeId: 'auth-session',
        target: `${context.backendUrl}/auth/login`,
        required: true,
        executed: false,
        status: probeStatusMissingEvidence(),
        failureClass: failureClassMissingEvidence(),
        summary:
          'Auth probe obtained credentials but found no guarded GET route from backend entrypoints.',
        latencyMs: Date.now() - start,
        artifactPaths: PROBE_ARTIFACT_PATHS,
      };
    }
    let me = null as Awaited<ReturnType<typeof httpGet>> | null;
    let reachedPath = authReadPaths[0];
    for (const protectedPath of authReadPaths) {
      const firstAttempt = await httpGet(protectedPath, {
        jwt: creds.token,
        timeout: 8000,
      });
      me = firstAttempt;
      if (firstAttempt.ok) {
        reachedPath = protectedPath;
        break;
      }
      if (firstAttempt.status >= 500 && firstAttempt.status < 600) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        const retryAttempt = await httpGet(protectedPath, {
          jwt: creds.token,
          timeout: 8000,
        });
        me = retryAttempt;
        if (retryAttempt.ok) {
          reachedPath = protectedPath;
          break;
        }
      }
    }
    if (!me || !me.ok) {
      return {
        probeId: 'auth-session',
        target: `${context.backendUrl}/auth/login -> ${reachedPath}`,
        required: true,
        executed: true,
        status: probeStatusFailed(),
        failureClass: failureClassProductFailure(),
        summary: `Auth probe obtained a token but the protected workspace endpoint returned HTTP ${me?.status || 0}.`,
        latencyMs: Date.now() - start,
        artifactPaths: PROBE_ARTIFACT_PATHS,
        metrics: {
          authStatus: me?.status || 0,
          workspaceIdDetected: Boolean(creds.workspaceId),
        },
      };
    }
    return {
      probeId: 'auth-session',
      target: `${context.backendUrl}/auth/login -> ${reachedPath}`,
      required: true,
      executed: true,
      status: probeStatusPassed(),
      summary: `Auth probe obtained a token and reached ${reachedPath} successfully.`,
      latencyMs: Date.now() - start,
      artifactPaths: PROBE_ARTIFACT_PATHS,
      metrics: {
        authStatus: me.status,
        workspaceIdDetected: Boolean(creds.workspaceId),
      },
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown auth failure';
    const failureClass = shouldTreatAsMissingEvidence(context.backendSource)
      ? failureClassMissingEvidence()
      : failureClassProductFailure();
    return {
      probeId: 'auth-session',
      target: `${context.backendUrl}/auth/login`,
      required: true,
      executed: false,
      status: failureClass === failureClassMissingEvidence() ? probeStatusMissingEvidence() : probeStatusFailed(),
      failureClass,
      summary: compactReason(`Auth probe failed: ${message}`),
      latencyMs: Date.now() - start,
      artifactPaths: PROBE_ARTIFACT_PATHS,
    };
  }
}

export async function runAdRulesProbe(
  context: RuntimeProbeContext,
): Promise<PulseRuntimeProbeResult> {
  const start = Date.now();
  const target = `${context.backendUrl}/ad-rules`;
  if (shouldTreatAsMissingEvidence(context.backendSource)) {
    return {
      probeId: 'ad-rules',
      target,
      required: false,
      executed: false,
      status: probeStatusMissingEvidence(),
      failureClass: failureClassMissingEvidence(),
      summary: `Backend runtime resolution is still fallback-only (${context.backendUrl}); ad rules proof cannot run honestly.`,
      latencyMs: Date.now() - start,
      artifactPaths: PROBE_ARTIFACT_PATHS,
    };
  }

  try {
    const creds = await obtainAuthToken(context.backendUrl);
    const response = await httpGet('/ad-rules', {
      jwt: creds.token,
      timeout: 8000,
    });

    if (!response.ok) {
      return {
        probeId: 'ad-rules',
        target,
        required: false,
        executed: true,
        status: probeStatusFailed(),
        failureClass: failureClassProductFailure(),
        summary: `Ad rules runtime probe reached /ad-rules but received HTTP ${response.status}.`,
        latencyMs: Date.now() - start,
        artifactPaths: PROBE_ARTIFACT_PATHS,
        metrics: {
          status: response.status,
          workspaceIdDetected: Boolean(creds.workspaceId),
        },
      };
    }

    return {
      probeId: 'ad-rules',
      target,
      required: false,
      executed: true,
      status: probeStatusPassed(),
      summary: 'Ad rules runtime probe authenticated and reached /ad-rules successfully.',
      latencyMs: Date.now() - start,
      artifactPaths: PROBE_ARTIFACT_PATHS,
      metrics: {
        status: response.status,
        workspaceIdDetected: Boolean(creds.workspaceId),
      },
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown ad rules failure';
    const failureClass = shouldTreatAsMissingEvidence(context.backendSource)
      ? failureClassMissingEvidence()
      : failureClassProductFailure();
    return {
      probeId: 'ad-rules',
      target,
      required: false,
      executed: false,
      status: failureClass === failureClassMissingEvidence() ? probeStatusMissingEvidence() : probeStatusFailed(),
      failureClass,
      summary: compactReason(`Ad rules runtime probe failed: ${message}`),
      latencyMs: Date.now() - start,
      artifactPaths: PROBE_ARTIFACT_PATHS,
    };
  }
}

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
      status: probeStatusMissingEvidence(),
      failureClass: failureClassMissingEvidence(),
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
      status: res.status < 500 ? probeStatusPassed() : probeStatusFailed(),
      failureClass: res.status < 500 ? undefined : failureClassProductFailure(),
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
      ? failureClassMissingEvidence()
      : failureClassProductFailure();
    return {
      probeId: 'frontend-reachability',
      target: context.frontendUrl,
      required: context.env === 'total',
      executed: false,
      status: failureClass === failureClassMissingEvidence() ? probeStatusMissingEvidence() : probeStatusFailed(),
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
      status: probeStatusPassed(),
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
    if (fallbackProbe.status === probeStatusPassed()) {
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
