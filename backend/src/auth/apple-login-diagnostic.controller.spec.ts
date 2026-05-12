import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { AppleLoginDiagnosticController } from './apple-login-diagnostic.controller';

function buildConfig(values: Record<string, string | undefined>) {
  return {
    get: jest.fn((key: string) => values[key]),
  } as never as ConstructorParameters<typeof AppleLoginDiagnosticController>[0];
}

// Isolate each test's artifact dir via APPLE_VALIDATION_DIR so the controller
// reads from a tmp folder we control, never from the real repo artifacts.
function withTempArtifacts(probe: Record<string, unknown> | null) {
  const dir = resolve(
    tmpdir(),
    `apple-validation-spec-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  process.env.APPLE_VALIDATION_DIR = dir;
  if (probe) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, '2026-05-12T00-00-00-000Z.json'), JSON.stringify(probe));
  }
  return () => {
    delete process.env.APPLE_VALIDATION_DIR;
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  };
}

describe('AppleLoginDiagnosticController', () => {
  it('reports fully configured when all env vars are set', () => {
    const config = buildConfig({
      APPLE_TEAM_ID: 'TEAM123',
      APPLE_KEY_ID: 'KEY456',
      APPLE_PRIVATE_KEY_P8: '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----',
      APPLE_SERVICE_ID: 'com.kloel.signin',
      APPLE_REDIRECT_URI: 'https://kloel.com/api/auth/callback/apple',
    });
    const controller = new AppleLoginDiagnosticController(config);
    const result = controller.diagnostic();

    expect(result.configured).toBe(true);
    expect(result.missingVars).toEqual([]);
    expect(result.configuredVars).toEqual([
      'APPLE_TEAM_ID',
      'APPLE_KEY_ID',
      'APPLE_PRIVATE_KEY_P8',
      'APPLE_SERVICE_ID',
      'APPLE_REDIRECT_URI',
    ]);
  });

  it('reports not configured and lists missing vars', () => {
    const config = buildConfig({});
    const controller = new AppleLoginDiagnosticController(config);
    const result = controller.diagnostic();

    expect(result.configured).toBe(false);
    expect(result.missingVars).toEqual([
      'APPLE_TEAM_ID',
      'APPLE_KEY_ID',
      'APPLE_PRIVATE_KEY_P8',
      'APPLE_SERVICE_ID',
      'APPLE_REDIRECT_URI',
    ]);
    expect(result.configuredVars).toEqual([]);
  });

  it('reports partial configuration correctly', () => {
    const config = buildConfig({
      APPLE_TEAM_ID: 'TEAM123',
      APPLE_KEY_ID: 'KEY456',
    });
    const controller = new AppleLoginDiagnosticController(config);
    const result = controller.diagnostic();

    expect(result.configured).toBe(false);
    expect(result.configuredVars).toEqual(['APPLE_TEAM_ID', 'APPLE_KEY_ID']);
    expect(result.missingVars).toEqual([
      'APPLE_PRIVATE_KEY_P8',
      'APPLE_SERVICE_ID',
      'APPLE_REDIRECT_URI',
    ]);
  });

  it('has lastProbe as null when no artifacts exist', () => {
    const cleanup = withTempArtifacts(null);
    const config = buildConfig({
      APPLE_TEAM_ID: 'TEAM123',
      APPLE_KEY_ID: 'KEY456',
      APPLE_PRIVATE_KEY_P8: 'key',
      APPLE_SERVICE_ID: 'com.kloel.signin',
      APPLE_REDIRECT_URI: 'https://kloel.com/callback',
    });
    const controller = new AppleLoginDiagnosticController(config);
    try {
      const result = controller.diagnostic();
      expect(result.configured).toBe(true);
      expect(result.lastProbe).toBeNull();
    } finally {
      cleanup();
    }
  });

  it('populates lastProbe when a recent PASS artifact exists', () => {
    const cleanup = withTempArtifacts({
      result: 'PASS',
      status: 400,
      error: 'invalid_grant',
      errorDescription: 'authorization code invalid',
      at: new Date().toISOString(),
    });
    const config = buildConfig({
      APPLE_TEAM_ID: 'TEAM123',
      APPLE_KEY_ID: 'KEY456',
      APPLE_PRIVATE_KEY_P8: 'key',
      APPLE_SERVICE_ID: 'com.kloel.signin',
      APPLE_REDIRECT_URI: 'https://kloel.com/callback',
    });
    const controller = new AppleLoginDiagnosticController(config);
    try {
      const result = controller.diagnostic();
      expect(result.lastProbe).not.toBeNull();
      expect(result.lastProbe?.result).toBe('PASS');
    } finally {
      cleanup();
    }
  });

  it('surfaces error field when last probe was FAIL', () => {
    const cleanup = withTempArtifacts({
      result: 'FAIL',
      status: 400,
      error: 'invalid_client',
      errorDescription: 'client_secret mismatch',
      at: new Date().toISOString(),
    });
    const config = buildConfig({
      APPLE_TEAM_ID: 'TEAM123',
      APPLE_KEY_ID: 'KEY456',
      APPLE_PRIVATE_KEY_P8: 'key',
      APPLE_SERVICE_ID: 'com.kloel.signin',
      APPLE_REDIRECT_URI: 'https://kloel.com/callback',
    });
    const controller = new AppleLoginDiagnosticController(config);
    try {
      const result = controller.diagnostic();
      expect(result.lastProbe?.result).toBe('FAIL');
      expect(result.lastProbe?.error).toBe('invalid_client');
    } finally {
      cleanup();
    }
  });

  it('ignores lastProbe older than 7 days (gating window)', () => {
    const eightDaysAgoIso = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const cleanup = withTempArtifacts({
      result: 'PASS',
      status: 400,
      error: 'invalid_grant',
      at: eightDaysAgoIso,
    });
    const config = buildConfig({
      APPLE_TEAM_ID: 'TEAM123',
      APPLE_KEY_ID: 'KEY456',
      APPLE_PRIVATE_KEY_P8: 'key',
      APPLE_SERVICE_ID: 'com.kloel.signin',
      APPLE_REDIRECT_URI: 'https://kloel.com/callback',
    });
    const controller = new AppleLoginDiagnosticController(config);
    try {
      const result = controller.diagnostic();
      // The frontend gating treats this as "needs fresh probe" — last probe
      // null even though the artifact exists.
      expect(result.lastProbe).toBeNull();
    } finally {
      cleanup();
    }
  });

  it('reads from APPLE_VALIDATION_DIR override even when default dirs are unset', () => {
    const cleanup = withTempArtifacts({
      result: 'PASS',
      status: 400,
      error: 'invalid_grant',
      at: new Date().toISOString(),
    });
    const config = buildConfig({
      APPLE_TEAM_ID: 'T',
      APPLE_KEY_ID: 'K',
      APPLE_PRIVATE_KEY_P8: 'P',
      APPLE_SERVICE_ID: 'S',
      APPLE_REDIRECT_URI: 'R',
    });
    const controller = new AppleLoginDiagnosticController(config);
    try {
      const result = controller.diagnostic();
      expect(result.lastProbe?.result).toBe('PASS');
    } finally {
      cleanup();
    }
  });
});
