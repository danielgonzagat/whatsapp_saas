import { test, expect } from '@playwright/test';
import { ensureE2EAdmin } from './e2e-helpers';

/**
 * Verifica que o endpoint /autopilot/run enfileira job no worker.
 * Pré-req: backend e worker rodando com AUTH_OPTIONAL=true em dev.
 */
test('autopilot run enqueues job', async ({ request }) => {
  const { token, workspaceId } = await ensureE2EAdmin(request);

  // Garante que o workspace não está suspenso por billing (evita interferência de outros testes).
  await request.post(`http://localhost:3001/workspace/${workspaceId}/settings`, {
    data: { billingSuspended: false },
    headers: { authorization: `Bearer ${token}` },
  });

  const payload = {
    workspaceId,
    phone: '5511999991234',
    message: 'quero saber o preço',
  };

  const res = await request.post('http://localhost:3001/autopilot/run', {
    data: payload,
    headers: { authorization: `Bearer ${token}` },
  });

  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body?.queued).toBeTruthy();
});
