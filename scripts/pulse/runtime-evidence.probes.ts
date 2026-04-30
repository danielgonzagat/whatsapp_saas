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
import type { RuntimeProbeContext, PulseRuntimeProbeResult } from './runtime-evidence.db-probe';

export { runDbReadbackFallback, shouldTreatAsMissingEvidence } from './runtime-evidence.db-probe';
export type { RuntimeProbeContext, PulseRuntimeProbeResult } from './runtime-evidence.db-probe';

const RUNTIME_EVIDENCE_PATH = 'PULSE_RUNTIME_EVIDENCE.json';
const RUNTIME_PROBES_PATH = 'PULSE_RUNTIME_PROBES.json';
const PROBE_ARTIFACT_PATHS = [RUNTIME_EVIDENCE_PATH, RUNTIME_PROBES_PATH];

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
      return entry.name === 'node_modules' || entry.name === 'dist'
        ? []
        : listTypeScriptFiles(fullPath);
    }
    return entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')
      ? [fullPath]
      : [];
  });
}

function readOptionalText(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf8');
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
      status: 'missing_evidence',
      failureClass: 'missing_evidence',
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
      status: 'missing_evidence',
      failureClass: 'missing_evidence',
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
        status: 'passed',
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
    ? 'missing_evidence'
    : 'product_failure';
  const failingRes = await httpGet(targetPath, { timeout: 4000 });
  return {
    probeId: 'backend-health',
    target: `${context.backendUrl}${targetPath}`,
    required: true,
    executed: failingRes.status > 0,
    status: fallbackFailureClass === 'missing_evidence' ? 'missing_evidence' : 'failed',
    failureClass: fallbackFailureClass,
    summary: compactReason(
      failingRes.status === 0
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
      status: 'missing_evidence',
      failureClass: 'missing_evidence',
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
        status: 'missing_evidence',
        failureClass: 'missing_evidence',
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
        status: 'failed',
        failureClass: 'product_failure',
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
      status: 'passed',
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
      ? 'missing_evidence'
      : 'product_failure';
    return {
      probeId: 'auth-session',
      target: `${context.backendUrl}/auth/login`,
      required: true,
      executed: false,
      status: failureClass === 'missing_evidence' ? 'missing_evidence' : 'failed',
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
      status: 'missing_evidence',
      failureClass: 'missing_evidence',
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
        status: 'failed',
        failureClass: 'product_failure',
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
      status: 'passed',
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
      ? 'missing_evidence'
      : 'product_failure';
    return {
      probeId: 'ad-rules',
      target,
      required: false,
      executed: false,
      status: failureClass === 'missing_evidence' ? 'missing_evidence' : 'failed',
      failureClass,
      summary: compactReason(`Ad rules runtime probe failed: ${message}`),
      latencyMs: Date.now() - start,
      artifactPaths: PROBE_ARTIFACT_PATHS,
    };
  }
}
import "./__companions__/runtime-evidence.probes.companion";
