import { test, expect } from '@playwright/test';
import { getE2EBaseUrls } from './e2e-helpers';

const { workerUrl: WORKER_URL } = getE2EBaseUrls();

test('worker health exposes autopilot queue info', async ({ request }) => {
  const res = await request.get(`${WORKER_URL}/health`);
  expect(res.ok()).toBeTruthy();

  const body = await res.json();
  expect(body.status).toBe('ok');
  expect(body.queues?.autopilot).toBeTruthy();
  expect(typeof body.queues.autopilot.waiting).toBe('number');
});
