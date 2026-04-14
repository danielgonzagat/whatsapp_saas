import type { APIRequestContext, Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';

export interface E2EAuthContext {
  token: string;
  workspaceId: string;
  email: string;
  password: string;
}

export interface E2EBaseUrls {
  frontendUrl: string;
  marketingUrl: string;
  authUrl: string;
  appUrl: string;
  payUrl: string;
  apiUrl: string;
  workerUrl: string;
}

let cachedAuth: Promise<E2EAuthContext> | null = null;

type E2EAuthCacheFile = {
  token?: string;
  workspaceId?: string;
  email?: string;
  password?: string;
  createdAt?: string;
};

function decodeJwtPayload(token: string): Record<string, any> | null {
  const [, payload = ''] = token.split('.');
  if (!payload) return null;

  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function hasSufficientTokenLifetime(token: string, minRemainingMs = 5 * 60 * 1000): boolean {
  const payload = decodeJwtPayload(token);
  const exp = typeof payload?.exp === 'number' ? payload.exp : null;
  if (!exp) return true;
  return exp * 1000 - Date.now() > minRemainingMs;
}

function getEnv(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim().length ? v : undefined;
}

function coerceAbsoluteUrl(candidate: string): string | undefined {
  const trimmed = candidate.trim();
  if (!trimmed) {
    return undefined;
  }

  const tryParse = (value: string) => {
    try {
      return new URL(value).origin;
    } catch {
      return undefined;
    }
  };

  const direct = tryParse(trimmed);
  if (direct) {
    return direct;
  }

  if (/^[a-z0-9.-]+(?::\d+)?(?:\/.*)?$/i.test(trimmed)) {
    const protocol =
      /^(localhost|127\.0\.0\.1|\[::1\]|.+\.railway\.internal)(?::\d+)?(?:\/.*)?$/i.test(trimmed)
        ? 'http://'
        : 'https://';
    return tryParse(`${protocol}${trimmed}`);
  }

  return undefined;
}

function getFirstAbsoluteUrl(...candidates: Array<string | undefined>): string | undefined {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const normalized = coerceAbsoluteUrl(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return undefined;
}

function isLocalHostname(hostname: string) {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.127.0.0.1')
  );
}

function normalizeLocalRootHostname(hostname: string) {
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'localhost';
  }

  const normalized = hostname.replace(/^(auth|app|pay)\./, '');
  return normalized === '127.0.0.1' ? 'localhost' : normalized;
}

function deriveHostTargetUrl(origin: string, target: 'marketing' | 'auth' | 'app' | 'pay'): string {
  const url = new URL(origin);
  const hostname = url.hostname.toLowerCase();

  const baseHostname = normalizeLocalRootHostname(hostname);

  if (isLocalHostname(hostname)) {
    url.hostname = target === 'marketing' ? baseHostname : `${target}.${baseHostname}`;
    return url.origin;
  }

  if (target === 'marketing') {
    url.hostname = baseHostname;
  } else if (!hostname.startsWith(`${target}.`)) {
    url.hostname = `${target}.${baseHostname}`;
  }

  return url.origin;
}

export function getE2EBaseUrls(): E2EBaseUrls {
  const marketingUrl =
    getEnv('E2E_MARKETING_URL') ||
    getEnv('E2E_FRONTEND_URL') ||
    getEnv('NEXT_PUBLIC_SITE_URL') ||
    'http://localhost:3000';
  const authUrl =
    getEnv('E2E_AUTH_URL') ||
    getEnv('NEXT_PUBLIC_AUTH_URL') ||
    deriveHostTargetUrl(marketingUrl, 'auth');
  const appUrl =
    getEnv('E2E_APP_URL') ||
    getEnv('NEXT_PUBLIC_APP_URL') ||
    deriveHostTargetUrl(marketingUrl, 'app');
  const payUrl =
    getEnv('E2E_PAY_URL') ||
    getEnv('NEXT_PUBLIC_CHECKOUT_DOMAIN') ||
    deriveHostTargetUrl(marketingUrl, 'pay');
  const apiUrl =
    getFirstAbsoluteUrl(
      getEnv('E2E_API_URL'),
      getEnv('BACKEND_URL'),
      getEnv('SERVICE_BASE_URL'),
      getEnv('NEXT_PUBLIC_API_URL'),
      getEnv('RAILWAY_BACKEND_URL'),
    ) || 'http://localhost:3001';
  const workerUrl =
    getFirstAbsoluteUrl(getEnv('E2E_WORKER_URL'), getEnv('PULSE_WORKER_URL')) ||
    'http://localhost:3003';

  return {
    frontendUrl: marketingUrl,
    marketingUrl,
    authUrl,
    appUrl,
    payUrl,
    apiUrl,
    workerUrl,
  };
}

export async function seedE2EAuthSession(
  page: Page,
  auth: Pick<E2EAuthContext, 'token' | 'workspaceId'>,
) {
  const { appUrl } = getE2EBaseUrls();

  await page.context().addCookies([
    {
      name: 'kloel_auth',
      value: '1',
      url: appUrl,
      sameSite: 'Lax',
    },
    {
      name: 'kloel_token',
      value: auth.token,
      url: appUrl,
      sameSite: 'Lax',
    },
    {
      name: 'kloel_access_token',
      value: auth.token,
      url: appUrl,
      sameSite: 'Lax',
    },
    {
      name: 'kloel_workspace_id',
      value: auth.workspaceId,
      url: appUrl,
      sameSite: 'Lax',
    },
  ]);

  await page.addInitScript(({ token, workspaceId }) => {
    window.localStorage.setItem('kloel_access_token', token);
    window.localStorage.setItem('kloel_workspace_id', workspaceId);
  }, auth);
}

export async function bootstrapAuthenticatedPage(
  page: Page,
  auth: Pick<E2EAuthContext, 'token' | 'workspaceId'>,
  options?: { landingPath?: string },
) {
  const { appUrl } = getE2EBaseUrls();

  await seedE2EAuthSession(page, auth);
  await page.goto(`${appUrl}${options?.landingPath || '/dashboard?e2e_auth_bootstrap=1'}`, {
    waitUntil: 'domcontentloaded',
  });

  const probe = await page.evaluate(async () => {
    const token = window.localStorage.getItem('kloel_access_token');
    const workspaceId = window.localStorage.getItem('kloel_workspace_id');
    const headers: Record<string, string> = {
      'X-Requested-With': 'XMLHttpRequest',
    };

    if (token) {
      headers.authorization = `Bearer ${token}`;
      headers['x-kloel-access-token'] = token;
    }

    if (workspaceId) {
      headers['x-workspace-id'] = workspaceId;
      headers['x-kloel-workspace-id'] = workspaceId;
    }

    const response = await fetch('/api/workspace/me', {
      method: 'GET',
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const body = await response.text().catch(() => '');

    return {
      ok: response.ok,
      status: response.status,
      body: body.slice(0, 500),
      hasToken: Boolean(token),
      hasWorkspaceId: Boolean(workspaceId),
      cookies: document.cookie,
    };
  });

  if (!probe.ok) {
    throw new Error(
      `E2E auth bootstrap failed: /api/workspace/me returned ${probe.status} ${probe.body || '(empty body)'}`,
    );
  }

  const cookieAcceptButton = page.getByRole('button', { name: 'Aceitar tudo' });
  const cookieBannerVisible = await cookieAcceptButton
    .waitFor({ state: 'visible', timeout: 2_000 })
    .then(() => true)
    .catch(() => false);

  if (cookieBannerVisible) {
    await cookieAcceptButton.click();
  }

  return probe;
}

export async function ensureE2EAdmin(request: APIRequestContext): Promise<E2EAuthContext> {
  if (cachedAuth) return cachedAuth;

  cachedAuth = (async () => {
    const { apiUrl } = getE2EBaseUrls();

    const password = getEnv('E2E_ADMIN_PASSWORD') || 'password';
    const email = getEnv('E2E_ADMIN_EMAIL') || 'admin+e2e@example.com';
    const workerKey =
      getEnv('TEST_WORKER_INDEX') ||
      getEnv('PW_TEST_WORKER_INDEX') ||
      getEnv('PLAYWRIGHT_WORKER_INDEX') ||
      String(process.pid);

    const cacheFile =
      getEnv('E2E_AUTH_CACHE_FILE') || path.join(process.cwd(), `.e2e-auth.${workerKey}.json`);
    const lockFile = `${cacheFile}.lock`;

    const envToken = getEnv('E2E_API_TOKEN');
    const envWorkspaceId = getEnv('E2E_WORKSPACE_ID');

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const readCache = (): E2EAuthCacheFile | null => {
      try {
        if (!fs.existsSync(cacheFile)) return null;
        const raw = fs.readFileSync(cacheFile, 'utf8');
        return JSON.parse(raw || '{}') as E2EAuthCacheFile;
      } catch {
        return null;
      }
    };

    const writeCache = (data: E2EAuthCacheFile) => {
      try {
        fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2), 'utf8');
      } catch {
        // best effort
      }
    };

    const withLock = async (fn: () => Promise<E2EAuthContext>): Promise<E2EAuthContext> => {
      const maxWaitMs = 15000;
      const startedAt = Date.now();
      // Try to acquire lock; if busy, wait for another worker to populate cache.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        try {
          const fd = fs.openSync(lockFile, 'wx');
          try {
            const result = await fn();
            return result;
          } finally {
            try {
              fs.closeSync(fd);
            } catch {
              // ignore
            }
            try {
              fs.unlinkSync(lockFile);
            } catch {
              // ignore
            }
          }
        } catch {
          const cached = readCache();
          if (cached?.token && cached?.workspaceId && cached?.email) {
            return cached as E2EAuthContext;
          }
          if (Date.now() - startedAt > maxWaitMs) {
            // Lock is stuck; proceed without it.
            return fn();
          }
          await sleep(250);
        }
      }
    };

    const doLogin = async (email: string) =>
      request.post(`${apiUrl}/auth/login`, {
        data: { email, password },
      });

    const doRegister = async (email: string) =>
      request.post(`${apiUrl}/auth/register`, {
        data: {
          name: 'E2E Admin',
          email,
          password,
          workspaceName: 'E2E Workspace',
        },
      });

    const parseAuth = async (
      res: Awaited<ReturnType<typeof request.post>>,
      email: string,
    ): Promise<E2EAuthContext> => {
      const json: any = await res.json();
      const token = json?.access_token;
      const workspaceId = json?.user?.workspaceId;
      if (!token || !workspaceId) {
        throw new Error('E2E setup: auth did not return token/workspaceId');
      }
      return { token, workspaceId, email, password };
    };

    const validateToken = async (token: string): Promise<boolean> => {
      if (!hasSufficientTokenLifetime(token)) {
        return false;
      }
      try {
        const res = await request.get(`${apiUrl}/workspace/me`, {
          headers: { authorization: `Bearer ${token}` },
        });
        return res.ok();
      } catch {
        return false;
      }
    };

    return withLock(async () => {
      const cached = readCache();
      const emailFromCache = cached?.email;
      const effectiveEmail = getEnv('E2E_ADMIN_EMAIL') || email || emailFromCache;
      const preferInteractiveAuth = Boolean(
        getEnv('E2E_ADMIN_EMAIL') && getEnv('E2E_ADMIN_PASSWORD'),
      );

      // Try cached token/workspace fast-path
      if (!getEnv('E2E_ADMIN_EMAIL') && cached?.token && cached?.workspaceId && cached?.email) {
        const ok = await validateToken(cached.token);
        if (ok) {
          return cached as E2EAuthContext;
        }

        // Token expirado/invalidado: tenta login para renovar
        const relogin = await doLogin(cached.email);
        if (relogin.ok()) {
          const ctx = await parseAuth(relogin as any, cached.email);
          writeCache({ ...ctx, createdAt: new Date().toISOString() });
          return ctx;
        }
      }

      if (!preferInteractiveAuth && envToken && envWorkspaceId) {
        return { token: envToken, workspaceId: envWorkspaceId, email, password };
      }

      // Try login (with retry for rate limiting)
      let loginRes = await doLogin(effectiveEmail);
      for (let attempt = 0; attempt < 5 && loginRes.status() === 429; attempt++) {
        await sleep(1000 * (attempt + 1));
        loginRes = await doLogin(effectiveEmail);
      }

      if (!loginRes.ok()) {
        // If unauthorized OR throttled, attempt register.
        if ([401, 403, 429].includes(loginRes.status())) {
          let registerRes = await doRegister(effectiveEmail);

          // Backoff more aggressively on 429 (message suggests minutes)
          const backoffMs = [2000, 5000, 10000, 20000, 30000];
          for (
            let attempt = 0;
            attempt < backoffMs.length && registerRes.status() === 429;
            attempt++
          ) {
            await sleep(backoffMs[attempt]);
            registerRes = await doRegister(effectiveEmail);
          }

          if (!registerRes.ok()) {
            // If email already exists (race or previous run), try login again.
            if ([400, 409].includes(registerRes.status())) {
              const retryLogin = await doLogin(effectiveEmail);
              if (retryLogin.ok()) {
                const ctx = await parseAuth(retryLogin as any, effectiveEmail);
                writeCache({ ...ctx, createdAt: new Date().toISOString() });
                return ctx;
              }
            }
            const body = await registerRes.text();
            throw new Error(`E2E setup: register failed (${registerRes.status()}): ${body}`);
          }

          const ctx = await parseAuth(registerRes as any, effectiveEmail);
          writeCache({ ...ctx, createdAt: new Date().toISOString() });
          return ctx;
        }

        const body = await loginRes.text();
        throw new Error(`E2E setup: login failed (${loginRes.status()}): ${body}`);
      }

      const ctx = await parseAuth(loginRes as any, effectiveEmail);
      writeCache({ ...ctx, createdAt: new Date().toISOString() });
      return ctx;
    });
  })();

  return cachedAuth;
}
