import type { Page } from '@playwright/test';
import type { E2EAuthContext, E2EBaseUrls } from './e2e-helpers';

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const [, payload = ''] = token.split('.');
  if (!payload) {
    return null;
  }

  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

export async function seedE2EAuthSessionWithUrls(
  page: Page,
  auth: Pick<E2EAuthContext, 'token' | 'workspaceId'>,
  urls: Pick<E2EBaseUrls, 'appUrl' | 'authUrl' | 'frontendUrl' | 'payUrl'>,
) {
  const { appUrl, authUrl, frontendUrl, payUrl } = urls;
  const consent = JSON.stringify({
    necessary: true,
    analytics: false,
    marketing: false,
    updatedAt: new Date(0).toISOString(),
  });
  const consentCookies = [...new Set([frontendUrl, authUrl, appUrl, payUrl])].map((url) => ({
    name: 'kloel_consent',
    value: consent,
    url,
    sameSite: 'Lax' as const,
  }));
  const payload = decodeJwtPayload(auth.token);
  const email = typeof payload?.email === 'string' ? payload.email : 'e2e@example.com';
  const name = typeof payload?.name === 'string' ? payload.name : email.split('@')[0] || 'E2E User';
  const userId = typeof payload?.sub === 'string' ? payload.sub : 'user-e2e';
  const onboardingCompletedAt = new Date(0).toISOString();

  await page.route('**/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: userId,
          email,
          name,
          workspaceId: auth.workspaceId,
          onboardingCompletedAt,
        },
        workspace: { id: auth.workspaceId, name: 'E2E Workspace' },
        workspaces: [{ id: auth.workspaceId, name: 'E2E Workspace' }],
        onboardingCompleted: true,
      }),
    });
  });

  await page.context().addCookies([
    ...consentCookies,
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
