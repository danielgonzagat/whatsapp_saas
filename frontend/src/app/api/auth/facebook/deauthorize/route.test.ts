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

describe('facebook deauthorize proxy route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.getBackendUrl.mockReset();
    mocks.getBackendUrl.mockReturnValue('https://backend.example.com');
  });

  it('returns method not allowed on GET', async () => {
    const response = GET();

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
    await expect(response.json()).resolves.toEqual({ message: 'Use POST.' });
  });

  it('proxies signed_request form payloads to the backend deauthorize endpoint', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const response = await POST(createRequest());

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://backend.example.com/auth/facebook/deauthorize',
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
    await expect(response.json()).resolves.toEqual({});
  });
});
