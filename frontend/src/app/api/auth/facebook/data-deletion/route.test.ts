import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../_lib/backend-url', () => ({
  getBackendUrl: () => 'https://backend.example.com',
}));

import { POST } from './route';

function createRequest(options?: {
  headers?: Record<string, string>;
  body?: string;
  url?: string;
}) {
  return {
    headers: new Headers(options?.headers),
    nextUrl: new URL(options?.url || 'https://app.kloel.com/api/auth/facebook/data-deletion'),
    text: vi.fn(async () => options?.body || ''),
  } as any;
}

describe('facebook data deletion proxy route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('forwards form-urlencoded payloads to the backend compliance callback', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          url: 'https://kloel.com/data-deletion/status/CONFIRM123456789',
          confirmation_code: 'CONFIRM123456789',
        }),
        {
          status: 201,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      ),
    );

    const response = await POST(
      createRequest({
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'x-forwarded-for': '1.1.1.1',
        },
        body: 'signed_request=signed-payload',
      }),
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      'https://backend.example.com/auth/facebook/data-deletion',
    );
    const init = fetchSpy.mock.calls[0]?.[1];
    const headers = init?.headers as Headers;
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('signed_request=signed-payload');
    expect(headers.get('Content-Type')).toBe('application/x-www-form-urlencoded');
    expect(headers.get('X-Forwarded-For')).toBe('1.1.1.1');

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      url: 'https://kloel.com/data-deletion/status/CONFIRM123456789',
      confirmation_code: 'CONFIRM123456789',
    });
  });
});
