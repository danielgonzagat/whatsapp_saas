import { test, expect } from '@playwright/test';

/**
 * Verifica que o endpoint /autopilot/run enfileira job no worker.
 * Pré-req: backend e worker rodando com AUTH_OPTIONAL=true em dev.
 */
test('autopilot run enqueues job', async ({ request }) => {
  const payload = {
    workspaceId: 'default',
    phone: '5511999991234',
    message: 'quero saber o preço',
  };

  const res = await request.post('http://localhost:3001/autopilot/run', {
    data: payload,
  });

  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body?.queued).toBeTruthy();
});
