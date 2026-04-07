import type { APIRequestContext, Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';

export interface E2EAuthContext {
  token: string;
  workspaceId: string;
  email: string;
  password: string;
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

export function getE2EBaseUrls() {
  return {
    frontendUrl: getEnv('E2E_FRONTEND_URL') || 'http://localhost:3000',
    apiUrl: getEnv('E2E_API_URL') || 'http://localhost:3001',
    workerUrl: getEnv('E2E_WORKER_URL') || getEnv('PULSE_WORKER_URL') || 'http://localhost:3003',
  };
}

export async function seedE2EAuthSession(
  page: Page,
  auth: Pick<E2EAuthContext, 'token' | 'workspaceId'>,
) {
  const { frontendUrl } = getE2EBaseUrls();

  await page.context().addCookies([
    {
      name: 'kloel_auth',
      value: '1',
      url: frontendUrl,
      sameSite: 'Lax',
    },
    {
      name: 'kloel_token',
      value: auth.token,
      url: frontendUrl,
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
  const { frontendUrl } = getE2EBaseUrls();

  await seedE2EAuthSession(page, auth);
  await page.goto(`${frontendUrl}${options?.landingPath || '/login?e2e_auth_bootstrap=1'}`, {
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

    // Prefer explicit token if provided
    const envToken = getEnv('E2E_API_TOKEN');
    const envWorkspaceId = getEnv('E2E_WORKSPACE_ID');
    if (envToken && envWorkspaceId) {
      return { token: envToken, workspaceId: envWorkspaceId, email, password };
    }

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
      const effectiveEmail =
        getEnv('E2E_ADMIN_EMAIL') ||
        emailFromCache ||
        `admin+e2e-${Date.now()}-${Math.floor(Math.random() * 1e9)}@example.com`;

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
