// PULSE Browser Stress Tester — Authentication

import type { Page } from 'playwright';
import type { AuthCredentials } from './types';

const DEFAULT_EMAIL = 'pulse-stress@test.kloel.com';
const DEFAULT_PASSWORD = 'PulseStress123!';
const DEFAULT_TIMEOUT_MS = 15000;

async function httpJson(url: string, opts: RequestInit = {}): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      ...opts,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...opts.headers as any },
    });
    const text = await res.text();
    let json: any;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }
    return { status: res.status, json };
  } catch (error: any) {
    return {
      status: 0,
      json: {
        error: error?.message || 'auth_request_failed',
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function obtainAuthToken(backendUrl: string): Promise<AuthCredentials> {
  const email = process.env.E2E_ADMIN_EMAIL || DEFAULT_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD || DEFAULT_PASSWORD;

  // Try login first
  const loginRes = await httpJson(`${backendUrl}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  if (loginRes.status === 200 || loginRes.status === 201) {
    const { access_token, user } = loginRes.json;
    const workspaceId = user?.workspaceId || user?.workspace_id || loginRes.json.workspaceId;
    if (!access_token || !workspaceId) {
      throw new Error(`Auth response missing fields: ${JSON.stringify(loginRes.json).slice(0, 200)}`);
    }
    return { token: access_token, workspaceId, email };
  }

  // Login failed — try register
  console.log('  Login failed, attempting register...');
  const registerRes = await httpJson(`${backendUrl}/auth/register`, {
    method: 'POST',
    body: JSON.stringify({
      name: 'PULSE Stress Tester',
      email,
      password,
      workspaceName: 'PULSE Stress Workspace',
    }),
  });

  if (registerRes.status === 200 || registerRes.status === 201) {
    const { access_token, user } = registerRes.json;
    const workspaceId = user?.workspaceId || user?.workspace_id || registerRes.json.workspaceId;
    if (!access_token || !workspaceId) {
      throw new Error(`Register response missing fields: ${JSON.stringify(registerRes.json).slice(0, 200)}`);
    }
    return { token: access_token, workspaceId, email };
  }

  // Register returned 409 (email exists) — retry login
  if (registerRes.status === 400 || registerRes.status === 409) {
    console.log('  Email already exists, retrying login...');
    await new Promise(r => setTimeout(r, 1000));
    const retryRes = await httpJson(`${backendUrl}/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (retryRes.status === 200 || retryRes.status === 201) {
      const { access_token, user } = retryRes.json;
      const workspaceId = user?.workspaceId || user?.workspace_id || retryRes.json.workspaceId;
      return { token: access_token, workspaceId, email };
    }
  }

  throw new Error(
    `Auth failed. Login: ${loginRes.status} ${JSON.stringify(loginRes.json).slice(0, 100)}. ` +
    `Register: ${registerRes.status} ${JSON.stringify(registerRes.json).slice(0, 100)}`
  );
}

export async function injectAuth(page: Page, creds: AuthCredentials, frontendUrl: string): Promise<void> {
  const url = new URL(frontendUrl);

  // Set cookie FIRST via Playwright API (works before navigation)
  await page.context().addCookies([{
    name: 'kloel_auth',
    value: '1',
    domain: url.hostname,
    path: '/',
    sameSite: 'Lax' as const,
  }]);

  // Use addInitScript to inject localStorage BEFORE page loads
  // This runs before every page navigation in this context
  await page.addInitScript(({ token, workspaceId }) => {
    try {
      localStorage.setItem('kloel_access_token', token);
      localStorage.setItem('kloel_workspace_id', workspaceId);
      localStorage.setItem('kloel_onboarding_completed', 'true');
      document.cookie = 'kloel_auth=1; path=/; SameSite=Lax';
    } catch { /* ignore if not available yet */ }
  }, creds);

  // Navigate to root to trigger the init script
  await page.goto(frontendUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1000);
}

export async function verifyAuth(page: Page, frontendUrl: string): Promise<boolean> {
  await page.goto(`${frontendUrl}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  // Wait a bit for client-side auth check
  await page.waitForTimeout(3000);

  const url = page.url();
  if (url.includes('/login')) {
    return false;
  }
  return true;
}
