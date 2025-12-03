import { test, expect } from '@playwright/test';

/**
 * Valida health do worker e exposição da fila Autopilot.
 */
test('worker health exposes autopilot queue info', async ({ request }) => {
  const res = await request.get('http://localhost:3003/health');
  expect(res.ok()).toBeTruthy();

  const body = await res.json();
  expect(body.status).toBe('ok');
  expect(body.queues?.autopilot).toBeTruthy();
  expect(typeof body.queues.autopilot.waiting).toBe('number');
});
