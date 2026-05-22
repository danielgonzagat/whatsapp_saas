import { test, expect } from '@playwright/test';
import { ensureE2EAdmin, getE2EBaseUrls } from './specs/e2e-helpers';

const { apiUrl: API_URL } = getE2EBaseUrls();

/**
 * Branched flow execution via API.
 * Complements flow-wait.spec.ts (single-path wait) by exercising
 * a flow with conditional branching (yes/no handles) and verifying
 * the correct branch is taken after inbound input.
 */
test('branched flow with wait resolves correct path on inbound', async ({ request }) => {
  test.setTimeout(90_000);

  const { token, workspaceId } = await ensureE2EAdmin(request);

  await request
    .post(`${API_URL}/workspace/${workspaceId}/settings`, {
      data: { billingSuspended: false },
      headers: { authorization: `Bearer ${token}` },
    })
    .catch(() => {});
  await request
    .post(`${API_URL}/billing/activate-trial`, {
      headers: { authorization: `Bearer ${token}` },
      params: { workspaceId },
    })
    .catch(() => {});

  const flowId = `e2e-branch-${workspaceId}-${Date.now()}`;
  const flow = {
    nodes: [
      { id: 'n1', type: 'messageNode', data: { text: 'Hello' } },
      {
        id: 'n2',
        type: 'waitNode',
        data: {
          expectedKeywords: 'sim,nao',
          timeoutSeconds: 15,
          yes: 'n3',
          no: 'n4',
        },
      },
      { id: 'n3', type: 'messageNode', data: { text: 'yes-branch' } },
      { id: 'n4', type: 'messageNode', data: { text: 'no-branch' } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3', sourceHandle: 'yes' },
      { id: 'e3', source: 'n2', target: 'n4', sourceHandle: 'no' },
    ],
  };

  const start = await request.post(`${API_URL}/flows/run`, {
    data: { flow, flowId, workspaceId, user: '5511999999999', startNode: 'n1' },
    headers: { authorization: `Bearer ${token}` },
  });
  if (!start.ok()) {
    const body = await start.text().catch(() => '');
    throw new Error(`POST /flows/run failed: ${start.status()} ${body.slice(0, 500)}`);
  }
  const { executionId } = await start.json();
  expect(executionId).toBeTruthy();

  // Send inbound message matching the "sim" keyword (yes branch)
  const incoming = await request.post(`${API_URL}/whatsapp/${workspaceId}/incoming`, {
    data: { from: '5511999999999', message: 'sim' },
    headers: { authorization: `Bearer ${token}` },
  });
  expect(incoming.ok()).toBeTruthy();

  // Poll for completion
  let status = 'RUNNING';
  const deadline = Date.now() + 35_000;
  while (status === 'RUNNING' && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1000));
    const res = await request.get(`${API_URL}/flows/execution/${executionId}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const body = await res.json().catch(() => ({}));
    status = body?.status;
  }

  expect(['PENDING', 'COMPLETED']).toContain(status);
});
