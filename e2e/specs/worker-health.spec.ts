import { test, expect } from '@playwright/test';
import { getE2EBaseUrls } from './e2e-helpers';

const { workerUrl: WORKER_URL } = getE2EBaseUrls();

test('worker health exposes autopilot queue info', async ({ request }) => {
  test.skip(
    !process.env.E2E_WORKER_HEALTH_ENABLED && !process.env.CI,
    'Defina E2E_WORKER_HEALTH_ENABLED=1 para validar o health do worker localmente.',
  );

  const res = await request.get(`${WORKER_URL}/health`);
  expect(res.ok()).toBeTruthy();

  const body = await res.json();
  expect(body.status).toBe('ok');
  expect(body.queues?.autopilot).toBeTruthy();
  expect(typeof body.queues.autopilot.waiting).toBe('number');
});
