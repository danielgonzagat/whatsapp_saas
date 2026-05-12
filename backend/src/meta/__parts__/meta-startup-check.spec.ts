import { runMetaStartupCheck } from './meta-startup-check';
import type { ResolvedOAuthRedirect } from './meta-oauth-url.helpers';

function loggerSpy() {
  return {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

function good(): ResolvedOAuthRedirect {
  return {
    redirectUri: 'https://api.kloel.com/meta/auth/callback',
    source: 'BACKEND_PUBLIC_URL',
    baseUrl: 'https://api.kloel.com',
    isFallback: false,
  };
}

function fallback(): ResolvedOAuthRedirect {
  return {
    redirectUri: 'http://localhost:3001/meta/auth/callback',
    source: 'fallback_localhost',
    baseUrl: 'http://localhost:3001',
    isFallback: true,
  };
}

describe('runMetaStartupCheck', () => {
  it('reports OK in production when all env vars are set', () => {
    const logger = loggerSpy();
    const r = runMetaStartupCheck({
      env: {
        NODE_ENV: 'production',
        META_APP_ID: 'app-1',
        META_APP_SECRET: 'secret',
        FRONTEND_URL: 'https://app.kloel.com',
        META_VERIFY_TOKEN: 'verify',
      },
      resolved: good(),
      logger,
    });
    expect(r.ok).toBe(true);
    expect(r.problems).toEqual([]);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('reports problem when redirect falls back to localhost in production', () => {
    const logger = loggerSpy();
    const r = runMetaStartupCheck({
      env: {
        NODE_ENV: 'production',
        META_APP_ID: 'app-1',
        META_APP_SECRET: 'secret',
        FRONTEND_URL: 'https://app.kloel.com',
      },
      resolved: fallback(),
      logger,
    });
    expect(r.ok).toBe(false);
    expect(r.problems.some((p) => p.includes('fallback localhost'))).toBe(true);
    expect(logger.error).toHaveBeenCalled();
  });

  it('flags missing required vars in production', () => {
    const logger = loggerSpy();
    const r = runMetaStartupCheck({
      env: { NODE_ENV: 'production', FRONTEND_URL: 'https://app.kloel.com' },
      resolved: good(),
      logger,
    });
    expect(r.ok).toBe(false);
    expect(r.problems.some((p) => p.includes('META_APP_ID'))).toBe(true);
    expect(r.problems.some((p) => p.includes('META_APP_SECRET'))).toBe(true);
  });

  it('does not gate dev mode on missing vars', () => {
    const logger = loggerSpy();
    const r = runMetaStartupCheck({
      env: { NODE_ENV: 'development' },
      resolved: fallback(),
      logger,
    });
    expect(r.ok).toBe(true);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('warns when redirect is not https in production', () => {
    const logger = loggerSpy();
    runMetaStartupCheck({
      env: {
        NODE_ENV: 'production',
        META_APP_ID: 'app',
        META_APP_SECRET: 's',
        FRONTEND_URL: 'http://app.kloel.com',
      },
      resolved: {
        redirectUri: 'http://api.kloel.com/meta/auth/callback',
        source: 'BACKEND_PUBLIC_URL',
        baseUrl: 'http://api.kloel.com',
        isFallback: false,
      },
      logger,
    });
    expect(logger.warn).toHaveBeenCalled();
  });
});
