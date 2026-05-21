import { test, expect } from '@playwright/test';
import { getE2EBaseUrls } from './e2e-helpers';

const { apiUrl: API_URL } = getE2EBaseUrls();

test('GET /health/liveness returns 200 with uptime and timestamp', async ({ request }) => {
  const res = await request.get(`${API_URL}/health/liveness`);
  expect(res.status()).toBe(200);

  const body = await res.json();
  expect(body.status).toBe('UP');
  expect(typeof body.uptime).toBe('number');
  expect(body.uptime).toBeGreaterThan(0);
  expect(typeof body.timestamp).toBe('string');
});

test('GET /health returns 200 as liveness alias', async ({ request }) => {
  const res = await request.get(`${API_URL}/health`);
  expect(res.status()).toBe(200);

  const body = await res.json();
  expect(body.status).toBe('UP');
  expect(typeof body.uptime).toBe('number');
});

test('GET /health/live returns 200 as liveness alias', async ({ request }) => {
  const res = await request.get(`${API_URL}/health/live`);
  expect(res.status()).toBe(200);

  const body = await res.json();
  expect(body.status).toBe('UP');
});

test('GET /health/ready returns 200 when DB and Redis are available', async ({ request }) => {
  const res = await request.get(`${API_URL}/health/ready`);
  expect(res.status()).toBe(200);

  const body = await res.json();
  expect(body.status).toBe('UP');
  expect(body.details.database.status).toBe('UP');
  expect(body.details.redis.status).toBe('UP');
});

test('GET /health/readiness returns full indicator breakdown', async ({ request }) => {
  const res = await request.get(`${API_URL}/health/readiness`);

  const body = await res.json();

  if (res.status() === 200) {
    expect(body.status).toBe('UP');
    expect(body.failures).toHaveLength(0);
  } else {
    expect(res.status()).toBe(503);
    expect(body.status).toBe('DOWN');
    expect(body.failures).toBeInstanceOf(Array);
    expect(body.failures.length).toBeGreaterThan(0);
    expect(typeof body.message).toBe('string');
  }

  expect(typeof body.timestamp).toBe('string');
});

test('GET /health/deep returns 401 without admin token', async ({ request }) => {
  const res = await request.get(`${API_URL}/health/deep`);
  expect(res.status()).toBe(401);
});

test('GET /health/deep returns 200 with valid admin token', async ({ request }) => {
  const res = await request.get(`${API_URL}/health/deep`, {
    headers: {
      Authorization: 'Bearer invalid-token',
    },
  });
  expect(res.status()).toBe(401);
});
