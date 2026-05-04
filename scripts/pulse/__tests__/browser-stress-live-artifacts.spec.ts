import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { auditPulseNoHardcodedReality } from '../no-hardcoded-reality-audit';
import {
  discoverBrowserLiveArtifacts,
  getPagePriorityFromArtifacts,
  isLoginRedirectFromArtifacts,
  isPublicRouteFromArtifacts,
  resolveRuntimeProbeTargetFromArtifacts,
  routeCandidateFromArtifactId,
} from '../browser-stress-tester/live-artifacts';

function makeRoot(): string {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-browser-live-'));
  fs.mkdirSync(path.join(rootDir, '.pulse', 'current'), { recursive: true });
  return rootDir;
}

function writeJson(rootDir: string, fileName: string, value: unknown): void {
  fs.writeFileSync(
    path.join(rootDir, '.pulse', 'current', fileName),
    JSON.stringify(value, null, 2),
    'utf8',
  );
}

function writeSource(rootDir: string, relativePath: string, content: string): void {
  const filePath = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

describe('PULSE browser stress live artifact discovery', () => {
  it('derives auth endpoints and browser storage contract from current PULSE artifacts', () => {
    const rootDir = makeRoot();
    writeJson(rootDir, 'PULSE_PRODUCT_GRAPH.json', {
      surfaces: [
        {
          id: 'identity',
          name: 'Identity',
          description: '',
          artifactIds: [
            'route:backend-src-identity-controller-ts:11:POST:custom-auth-login',
            'route:backend-src-identity-controller-ts:12:POST:custom-auth-register',
          ],
          capabilities: [],
          completeness: 0,
          truthMode: 'inferred',
        },
      ],
      capabilities: [],
      flows: [],
      orphanedArtifactIds: [],
      phantomCapabilities: [],
      latentCapabilities: [],
    });
    writeJson(rootDir, 'PULSE_SCOPE_STATE.json', {
      files: [
        {
          path: 'frontend/src/lib/session.ts',
          surface: 'frontend',
          kind: 'source',
          userFacing: true,
        },
      ],
    });
    writeSource(
      rootDir,
      'frontend/src/lib/session.ts',
      [
        "const DYNAMIC_ACCESS_SLOT = ['custom', 'access', 'session'].join('_');",
        "const DYNAMIC_WORKSPACE_SLOT = 'custom_workspace_scope';",
        "localStorage.setItem('custom_access_session', token);",
        'localStorage.setItem(DYNAMIC_ACCESS_SLOT, token);',
        'localStorage.setItem(DYNAMIC_WORKSPACE_SLOT, workspaceId);',
        "localStorage.setItem('custom_onboarding_done', 'true');",
        "document.cookie = 'custom_auth_cookie=1; path=/';",
      ].join('\n'),
    );

    const discovered = discoverBrowserLiveArtifacts(rootDir);

    expect(discovered.authRoutes.loginPath).toBe('/custom/auth/login');
    expect(discovered.authRoutes.registerPath).toBe('/custom/auth/register');
    expect(discovered.storage.tokenStorageKeys).toEqual(['custom_access_session']);
    expect(discovered.storage.workspaceStorageKeys).toEqual(['custom_workspace_scope']);
    expect(discovered.storage.onboardingStorageKeys).toEqual(['custom_onboarding_done']);
    expect(discovered.storage.authCookieNames).toEqual(['custom_auth_cookie']);
  });

  it('orders and classifies browser pages from an existing manifest overlay', () => {
    const rootDir = makeRoot();
    writeJson(rootDir, 'PULSE_RESOLVED_MANIFEST.json', {
      modules: [
        {
          key: 'zeta',
          routeRoots: ['zeta'],
          groups: ['main'],
          userFacing: true,
          critical: true,
          state: 'READY',
        },
        {
          key: 'signin',
          routeRoots: ['signin'],
          groups: ['public'],
          userFacing: true,
          critical: false,
          state: 'READY',
        },
      ],
    });

    const pages = discoverBrowserLiveArtifacts(rootDir).pages;

    expect(getPagePriorityFromArtifacts('/zeta/details', pages)).toBeLessThan(10);
    expect(isLoginRedirectFromArtifacts('https://app.example.test/signin', pages)).toBe(true);
    expect(isPublicRouteFromArtifacts('/signin', pages)).toBe(true);
  });

  it('builds runtime probe targets from route artifact IDs instead of fixed endpoint paths', () => {
    const rootDir = makeRoot();
    writeJson(rootDir, 'PULSE_PRODUCT_GRAPH.json', {
      surfaces: [
        {
          id: 'runtime',
          name: 'Runtime',
          description: '',
          artifactIds: [
            'route:backend-src-runtime-controller-ts:7:GET:custom-health-check',
            'route:backend-src-runtime-controller-ts:8:POST:custom-auth-login',
          ],
          capabilities: [],
          completeness: 0,
          truthMode: 'inferred',
        },
      ],
      capabilities: [],
      flows: [],
      orphanedArtifactIds: [],
      phantomCapabilities: [],
      latentCapabilities: [],
    });

    expect(routeCandidateFromArtifactId('route:x:1:GET:custom-health-check')?.path).toBe(
      '/custom/health/check',
    );
    expect(routeCandidateFromArtifactId('route:x:1:GET:custom-tenant-id-settings')?.path).toBe(
      '/custom/:tenantId/settings',
    );
    expect(
      resolveRuntimeProbeTargetFromArtifacts(
        'backend-health',
        'https://api.example.test',
        'https://app.example.test',
        'db',
        rootDir,
      ),
    ).toBe('https://api.example.test/custom/health/check');
    expect(
      resolveRuntimeProbeTargetFromArtifacts(
        'auth-session',
        'https://api.example.test',
        'https://app.example.test',
        'db',
        rootDir,
      ),
    ).toBe('https://api.example.test/custom/auth/login');
  });

  it('keeps live artifact discovery free of hardcoded reality authority findings', () => {
    const findings = auditPulseNoHardcodedReality(process.cwd()).findings.filter(
      (finding) => finding.filePath === 'scripts/pulse/browser-stress-tester/live-artifacts.ts',
    );

    expect(findings).toEqual([]);
  });
});
