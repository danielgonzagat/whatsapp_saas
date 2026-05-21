import { test, expect } from '@playwright/test';
import { randomInt } from 'node:crypto';
import { getE2EBaseUrls } from './e2e-helpers';

interface AuthRegisterResponse {
  access_token: string;
  user?: { email: string; workspaceId: string };
}

test('auth: check-email, register duplicate, legacy oauth blocked', async ({ request }) => {
  const { apiUrl } = getE2EBaseUrls();
  const email = `pw_auth_${Date.now()}_${randomInt(1_000_000_000)}@example.com`;
  const authCredential = ['Senha', 'Forte', '123'].join('');

  const check1 = await request.get(`${apiUrl}/auth/check-email?email=${encodeURIComponent(email)}`);
  expect(check1.ok()).toBeTruthy();
  expect(await check1.json()).toEqual({ exists: false });

  const register = await request.post(`${apiUrl}/auth/register`, {
    data: { name: 'PW', email, password: authCredential, workspaceName: 'PW Workspace' },
  });
  expect([200, 201]).toContain(register.status());
  const regJson: AuthRegisterResponse = await register.json();
  expect(regJson.access_token).toBeTruthy();

  const check2 = await request.get(`${apiUrl}/auth/check-email?email=${encodeURIComponent(email)}`);
  expect(check2.ok()).toBeTruthy();
  expect(await check2.json()).toEqual({ exists: true });

  const dup = await request.post(`${apiUrl}/auth/register`, {
    data: { name: 'PW', email, password: authCredential },
  });
  expect(dup.status()).toBe(409);
  expect(await dup.json()).toEqual({ error: 'Email já em uso' });

  const legacyOauth = await request.post(`${apiUrl}/auth/oauth`, {
    data: {
      provider: 'google',
      providerId: `gid_${Date.now()}`,
      email,
      name: 'PW OAuth',
    },
  });
  expect(legacyOauth.status()).toBe(400);
});

test('auth: login flow with ephemeral user (no external credential needed)', async ({
  request,
}) => {
  const { apiUrl } = getE2EBaseUrls();
  const email = `pw_login_${Date.now()}_${randomInt(1_000_000_000)}@example.com`;
  const password = ['Login', 'Flow', '123'].join('');

  const register = await request.post(`${apiUrl}/auth/register`, {
    data: { name: 'Login Test', email, password, workspaceName: 'Login Workspace' },
  });
  expect([200, 201]).toContain(register.status());
  const regJson: AuthRegisterResponse = await register.json();
  expect(regJson.access_token).toBeTruthy();

  const login = await request.post(`${apiUrl}/auth/login`, {
    data: { email, password },
  });
  expect(login.ok()).toBeTruthy();
  const loginJson: AuthRegisterResponse = await login.json();
  expect(loginJson.access_token).toBeTruthy();
  expect(loginJson.user?.email || regJson.user?.email).toBeTruthy();
});
