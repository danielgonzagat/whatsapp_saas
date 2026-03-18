import { test, expect } from '@playwright/test';
import { getE2EBaseUrls } from './e2e-helpers';

test('auth: check-email, register duplicate, legacy oauth blocked', async ({ request }) => {
  const { apiUrl } = getE2EBaseUrls();
  const email = `pw_auth_${Date.now()}_${Math.floor(Math.random() * 1e9)}@example.com`;
  const password = 'SenhaForte123';

  const check1 = await request.get(`${apiUrl}/auth/check-email?email=${encodeURIComponent(email)}`);
  expect(check1.ok()).toBeTruthy();
  expect(await check1.json()).toEqual({ exists: false });

  const register = await request.post(`${apiUrl}/auth/register`, {
    data: { name: 'PW', email, password, workspaceName: 'PW Workspace' },
  });
  expect([200, 201]).toContain(register.status());
  const regJson: any = await register.json();
  expect(regJson?.access_token).toBeTruthy();

  const check2 = await request.get(`${apiUrl}/auth/check-email?email=${encodeURIComponent(email)}`);
  expect(check2.ok()).toBeTruthy();
  expect(await check2.json()).toEqual({ exists: true });

  const dup = await request.post(`${apiUrl}/auth/register`, {
    data: { name: 'PW', email, password },
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

test('auth: secure google oauth endpoint accepts a real Google credential', async ({
  request,
}) => {
  test.skip(
    !process.env.E2E_GOOGLE_TEST_CREDENTIAL,
    'Defina E2E_GOOGLE_TEST_CREDENTIAL para validar o fluxo Google real.',
  );

  const { apiUrl } = getE2EBaseUrls();

  const googleAuth = await request.post(`${apiUrl}/auth/oauth/google`, {
    data: {
      credential: process.env.E2E_GOOGLE_TEST_CREDENTIAL,
    },
  });

  expect([200, 201]).toContain(googleAuth.status());
  const json: any = await googleAuth.json();
  expect(json?.access_token).toBeTruthy();
  expect(json?.user?.email).toBeTruthy();
});
