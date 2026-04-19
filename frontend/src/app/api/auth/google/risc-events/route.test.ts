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
    nextUrl: new URL(options?.url || 'https://app.kloel.com/api/auth/google/risc-events'),
    text: vi.fn(async () => options?.body || ''),
  } as any;
}

describe('google risc proxy route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('forwards raw SET JWT payloads to the backend risk callback', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ accepted: true }), {
        status: 202,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );

    const response = await POST(
      createRequest({
        headers: {
          'content-type': 'application/secevent+jwt',
          'x-forwarded-for': '1.1.1.1',
        },
        body: 'raw-security-event-token',
      }),
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe('https://backend.example.com/auth/google/risc-events');
    const init = fetchSpy.mock.calls[0]?.[1];
    const headers = init?.headers as Headers;
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('raw-security-event-token');
    expect(headers.get('Content-Type')).toBe('application/secevent+jwt');
    expect(headers.get('X-Forwarded-For')).toBe('1.1.1.1');

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ accepted: true });
  });
});
