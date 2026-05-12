import { AppleLoginDiagnosticController } from './apple-login-diagnostic.controller';

function buildConfig(values: Record<string, string | undefined>) {
  return {
    get: jest.fn((key: string) => values[key]),
  } as never as ConstructorParameters<typeof AppleLoginDiagnosticController>[0];
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
    const config = buildConfig({
      APPLE_TEAM_ID: 'TEAM123',
      APPLE_KEY_ID: 'KEY456',
      APPLE_PRIVATE_KEY_P8: 'key',
      APPLE_SERVICE_ID: 'com.kloel.signin',
      APPLE_REDIRECT_URI: 'https://kloel.com/callback',
    });
    const controller = new AppleLoginDiagnosticController(config);
    const result = controller.diagnostic();

    expect(result.configured).toBe(true);
    expect(result.lastProbe).toBeNull();
  });
});
