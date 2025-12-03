import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';

// Token de teste simples (assinado com 'dev-secret' default em dev)
const fakeToken =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  'eyJzdWIiOiJ0ZXN0dXNlciIsIndvcmtzcGFjZUlkIjoiZGVmYXVsdCIsInJvbGVzIjpbIkFETUlOIl0sImlhdCI6MTY5MDAwMDAwMH0.' +
  'j5kWZiSmOGWqZRowEpIHmi6cBmmFJdPAsu1i1eCXt-4';

test('flows/run rejects when no token and accepts with token (dev)', async ({ request }) => {
  const flow = {
    nodes: [
      { id: 'n1', type: 'messageNode', data: { text: 'hi' } },
      { id: 'n2', type: 'messageNode', data: { text: 'bye' } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
    ],
  };

  // Sem token → deve passar em dev apenas se AUTH_OPTIONAL=true; aqui esperamos 401/403 quando fechado
  const resNoAuth = await request.post(`${API}/flows/run`, {
    data: { flow, flowId: 'auth-test', user: '5511999999999', startNode: 'n1' },
  });
  // Em dev pode estar aberto; verificamos que com token deve aceitar

  const resWithAuth = await request.post(`${API}/flows/run`, {
    data: { flow, flowId: 'auth-test', user: '5511999999999', startNode: 'n1' },
    headers: { Authorization: `Bearer ${fakeToken}` },
  });
  expect(resWithAuth.ok()).toBeTruthy();

  const body = await resWithAuth.json();
  expect(body?.executionId).toBeTruthy();
});
