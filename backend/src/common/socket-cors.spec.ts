import { getSocketAllowedOrigins, isSocketOriginAllowed } from './socket-cors';

describe('socket CORS helpers', () => {
  it('includes the root.localhost app origin in the default local allowlist', () => {
    expect(getSocketAllowedOrigins({})).toContain('http://root.localhost:3000');
  });

  it('trims and deduplicates configured origins', () => {
    expect(
      getSocketAllowedOrigins({
        CORS_ALLOWED_ORIGINS: ' http://one.local ,http://one.local,http://two.local ',
      }),
    ).toEqual(['http://one.local', 'http://two.local']);
  });

  it('allows any browser origin outside production to match HTTP CORS dev behavior', () => {
    expect(
      isSocketOriginAllowed('http://root.localhost:3000', {
        NODE_ENV: 'development',
      }),
    ).toBe(true);
    expect(
      isSocketOriginAllowed('http://custom.local:3000', {
        NODE_ENV: 'test',
      }),
    ).toBe(true);
  });

  it('keeps production restricted to the configured allowlist', () => {
    const env = {
      NODE_ENV: 'production',
      CORS_ALLOWED_ORIGINS: 'https://app.kloel.com,http://root.localhost:3000',
    } as NodeJS.ProcessEnv;

    expect(isSocketOriginAllowed('https://app.kloel.com', env)).toBe(true);
    expect(isSocketOriginAllowed('http://root.localhost:3000', env)).toBe(true);
    expect(isSocketOriginAllowed('https://evil.example', env)).toBe(false);
  });
});
