import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getBackendUrl: vi.fn(() => 'https://backend.example.com'),
}));

vi.mock('@/app/api/_lib/backend-url', () => ({
  getBackendUrl: mocks.getBackendUrl,
}));

import { GET, POST } from './route';

function createRequest(
  body = 'signed_request=payload',
  contentType = 'application/x-www-form-urlencoded',
  forwardedFor = '203.0.113.10',
) {
  return {
    headers: new Headers({
      'content-type': contentType,
      'x-forwarded-for': forwardedFor,
      host: 'auth.kloel.com',
    }),
    text: vi.fn(async () => body),
  } as any;
}

describe('facebook data deletion proxy route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.getBackendUrl.mockReset();
    mocks.getBackendUrl.mockReturnValue('https://backend.example.com');
  });

  it('redirects GET requests to the public data deletion instructions page', () => {
    const response = GET();

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://kloel.com/data-deletion');
  });

  it('proxies signed_request form payloads to the backend callback endpoint', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          confirmation_code: 'code-123',
          url: 'https://kloel.com/data-deletion/status/code-123',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    const response = await POST(createRequest());

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://backend.example.com/auth/facebook/data-deletion',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Forwarded-For': '203.0.113.10',
        }),
        body: 'signed_request=payload',
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      confirmation_code: 'code-123',
      url: 'https://kloel.com/data-deletion/status/code-123',
    });
  });

  it('returns 503 when the backend url is not configured', async () => {
    mocks.getBackendUrl.mockReturnValue('');

    const response = await POST(createRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ message: 'Servidor não configurado.' });
  });
});
