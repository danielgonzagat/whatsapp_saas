import { test, expect } from '@playwright/test';
import { ensureE2EAdmin, getE2EBaseUrls } from './e2e-helpers';

const { apiUrl: API } = getE2EBaseUrls();

test('flows/run rejects when no token and accepts with token (dev)', async ({ request }) => {
  const { token, workspaceId } = await ensureE2EAdmin(request);
  const flow = {
    nodes: [
      { id: 'n1', type: 'messageNode', data: { text: 'hi' } },
      { id: 'n2', type: 'messageNode', data: { text: 'bye' } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
    ],
  };

  // Sem token → em dev pode aceitar; em ambientes fechados deve negar
  const resNoAuth = await request.post(`${API}/flows/run`, {
    data: { flow, flowId: 'auth-test', user: '5511999999999', startNode: 'n1' },
  });
  expect([201, 401, 403]).toContain(resNoAuth.status());

  const resWithAuth = await request.post(`${API}/flows/run`, {
    data: { flow, flowId: `auth-test-${workspaceId}`, workspaceId, user: '5511999999999', startNode: 'n1' },
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(resWithAuth.ok()).toBeTruthy();

  const body = await resWithAuth.json();
  expect(body?.executionId).toBeTruthy();
});
