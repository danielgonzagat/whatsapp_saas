import { test, expect } from '@playwright/test';
import { getE2EBaseUrls } from './e2e-helpers';

const { workerUrl: WORKER_URL } = getE2EBaseUrls();

/**
 * Valida health do worker e exposição da fila Autopilot.
 */
test('worker health exposes autopilot queue info', async ({ request }) => {
  let res;
  try {
    res = await request.get(`${WORKER_URL}/health`);
  } catch (error: any) {
    test.skip(true, `worker not reachable in this environment: ${error?.message || error}`);
    return;
  }
  expect(res.ok()).toBeTruthy();

  const body = await res.json();
  expect(body.status).toBe('ok');
  expect(body.queues?.autopilot).toBeTruthy();
  expect(typeof body.queues.autopilot.waiting).toBe('number');
});
