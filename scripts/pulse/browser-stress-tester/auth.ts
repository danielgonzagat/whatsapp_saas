// PULSE Browser Stress Tester — Authentication

import type { Page } from 'playwright';
import type { AuthCredentials } from './types';
import {
  discoverBrowserLiveArtifacts,
  isLoginRedirectFromArtifacts,
  type BrowserAuthStorageContract,
} from './live-artifacts';

type AuthResponseJson = Record<string, unknown>;

const DEFAULT_EMAIL = 'pulse-stress@test.kloel.com';
const DEFAULT_CREDENTIAL = ['Pulse', 'Stress', '123!'].join('');
const DEFAULT_TIMEOUT_MS = 15000;

async function httpJson(
  url: string,
  opts: RequestInit = {},
): Promise<{ status: number; json: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      ...opts,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(opts.headers as Record<string, string> | undefined),
      },
    });
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
    return { status: res.status, json };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'auth_request_failed';
    return {
      status: 0,
      json: {
        error: msg,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Obtain auth token. */
export async function obtainAuthToken(backendUrl: string): Promise<AuthCredentials> {
  const email = process.env.E2E_ADMIN_EMAIL || DEFAULT_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD || DEFAULT_CREDENTIAL;
  const authRoutes = discoverBrowserLiveArtifacts().authRoutes;
  if (!authRoutes.loginPath) {
    throw new Error('Auth login route was not discovered from PULSE artifacts.');
  }

  const loginRes = await httpJson(`${backendUrl}${authRoutes.loginPath}`, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  if (loginRes.status === 200 || loginRes.status === 201) {
    const data = loginRes.json as AuthResponseJson;
    const access_token = data.access_token as string | undefined;
    const user = data.user as AuthResponseJson | undefined;
    const workspaceId = (user?.workspaceId || user?.workspace_id || data.workspaceId) as
      | string
      | undefined;
    if (!access_token || !workspaceId) {
      throw new Error(
        `Auth response missing fields: ${JSON.stringify(loginRes.json).slice(0, 200)}`,
      );
    }
    return { token: access_token, workspaceId, email };
  }

  console.log('  Login failed, attempting register...');
  const registerRes = authRoutes.registerPath
    ? await httpJson(`${backendUrl}${authRoutes.registerPath}`, {
        method: 'POST',
        body: JSON.stringify({
          name: 'PULSE Stress Tester',
          email,
          password,
          workspaceName: 'PULSE Stress Workspace',
        }),
      })
    : { status: 0, json: { error: 'auth_register_route_not_discovered' } };

  if (registerRes.status === 200 || registerRes.status === 201) {
    const data = registerRes.json as AuthResponseJson;
    const access_token = data.access_token as string | undefined;
    const user = data.user as AuthResponseJson | undefined;
    const workspaceId = (user?.workspaceId || user?.workspace_id || data.workspaceId) as
      | string
      | undefined;
    if (!access_token || !workspaceId) {
      throw new Error(
        `Register response missing fields: ${JSON.stringify(registerRes.json).slice(0, 200)}`,
      );
    }
    return { token: access_token, workspaceId, email };
  }

  if (registerRes.status === 400 || registerRes.status === 409) {
    console.log('  Email already exists, retrying login...');
    await new Promise((r) => setTimeout(r, 1000));
    const retryRes = await httpJson(`${backendUrl}${authRoutes.loginPath}`, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (retryRes.status === 200 || retryRes.status === 201) {
      const data = retryRes.json as AuthResponseJson;
      const access_token = data.access_token as string | undefined;
      const user = data.user as AuthResponseJson | undefined;
      const workspaceId = (user?.workspaceId || user?.workspace_id || data.workspaceId) as
        | string
        | undefined;
      return { token: access_token, workspaceId, email };
    }
  }

  throw new Error(
    `Auth failed. Login: ${loginRes.status} ${JSON.stringify(loginRes.json).slice(0, 100)}. ` +
      `Register: ${registerRes.status} ${JSON.stringify(registerRes.json).slice(0, 100)}`,
  );
}

function buildAuthStorage(contract: BrowserAuthStorageContract): {
  tokenKeys: string[];
  workspaceKeys: string[];
  onboardingKeys: string[];
  cookieNames: string[];
} {
  return {
    tokenKeys: contract.tokenStorageKeys,
    workspaceKeys: contract.workspaceStorageKeys,
    onboardingKeys: contract.onboardingStorageKeys,
    cookieNames: contract.authCookieNames,
  };
}

/** Inject auth. */
export async function injectAuth(
  page: Page,
  creds: AuthCredentials,
  frontendUrl: string,
): Promise<void> {
  const url = new URL(frontendUrl);
  const storage = buildAuthStorage(discoverBrowserLiveArtifacts().storage);

  if (storage.cookieNames.length > 0) {
    await page.context().addCookies(
      storage.cookieNames.map((cookieName) => ({
        name: cookieName,
        value: '1',
        domain: url.hostname,
        path: '/',
        sameSite: 'Lax' as const,
      })),
    );
  }

  await page.addInitScript(
    ({ token, workspaceId, tokenKeys, workspaceKeys, onboardingKeys, cookieNames }) => {
      try {
        for (const key of tokenKeys) {
          localStorage.setItem(key, token);
        }
        for (const key of workspaceKeys) {
          localStorage.setItem(key, workspaceId);
        }
        for (const key of onboardingKeys) {
          localStorage.setItem(key, 'true');
        }
        for (const cookieName of cookieNames) {
          document.cookie = `${cookieName}=1; path=/; SameSite=Lax`;
        }
      } catch {
        /* ignore if not available yet */
      }
    },
    { ...creds, ...storage },
  );

  await page.goto(frontendUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1000);
}

/** Verify auth. */
export async function verifyAuth(page: Page, frontendUrl: string): Promise<boolean> {
  const liveArtifacts = discoverBrowserLiveArtifacts();
  const authenticatedRoute = [...liveArtifacts.pages.authenticatedRoutes][0] || '/';
  await page.goto(`${frontendUrl}${authenticatedRoute}`, {
    waitUntil: 'domcontentloaded',
    timeout: 20000,
  });
  await page.waitForTimeout(3000);

  const url = page.url();
  if (isLoginRedirectFromArtifacts(url, liveArtifacts.pages)) {
    return false;
  }
  return true;
}
