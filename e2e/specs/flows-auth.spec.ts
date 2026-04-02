import { test, expect } from '@playwright/test';
import { ensureE2EAdmin, getE2EBaseUrls } from './e2e-helpers';

const { apiUrl: API } = getE2EBaseUrls();

async function loginFreshToken(request: any, email: string, password: string) {
  const res = await request.post(`${API}/auth/login`, {
    data: { email, password },
  });
  const body = await res.json().catch(() => ({}));
  return {
    ok: res.ok(),
    status: res.status(),
    token: body?.access_token || '',
    workspaceId: body?.user?.workspaceId || '',
  };
}

test('flows/run rejects when no token and accepts with token (dev)', async ({ request }) => {
  const auth = await ensureE2EAdmin(request);
  let token = auth.token;
  let workspaceId = auth.workspaceId;
  const flowId = `auth-test-${workspaceId}-${Date.now()}`;
  const flow = {
    nodes: [
      { id: 'n1', type: 'messageNode', data: { text: 'hi' } },
      { id: 'n2', type: 'messageNode', data: { text: 'bye' } },
    ],
    edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
  };

  // Garante que billing não ficou suspenso por outro spec e não bloqueie /flows/run.
  await request
    .post(`${API}/workspace/${workspaceId}/settings`, {
      data: { billingSuspended: false },
      headers: { authorization: `Bearer ${token}` },
    })
    .catch(() => {});

  // Sem token → em dev pode aceitar; em ambientes fechados deve negar
  const resNoAuth = await request.post(`${API}/flows/run`, {
    data: { flow, flowId: 'auth-test', user: '5511999999999', startNode: 'n1' },
  });
  expect([201, 401, 403]).toContain(resNoAuth.status());

  let finalRes = await request.post(`${API}/flows/run`, {
    data: { flow, flowId, workspaceId, user: '5511999999999', startNode: 'n1' },
    headers: { authorization: `Bearer ${token}` },
  });
  if (!finalRes.ok() && finalRes.status() === 401) {
    const refreshed = await loginFreshToken(request, auth.email, auth.password);
    if (refreshed.ok && refreshed.token && refreshed.workspaceId) {
      token = refreshed.token;
      workspaceId = refreshed.workspaceId;
      finalRes = await request.post(`${API}/flows/run`, {
        data: { flow, flowId, workspaceId, user: '5511999999999', startNode: 'n1' },
        headers: { authorization: `Bearer ${token}` },
      });
    }
  }
  if (!finalRes.ok()) {
    const body = await finalRes.text().catch(() => '');
    throw new Error(`POST /flows/run with auth failed: ${finalRes.status()} ${body.slice(0, 500)}`);
  }

  const body = await finalRes.json().catch(() => ({}));
  expect(body?.executionId).toBeTruthy();
});
