import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../_lib/backend-url', () => ({
  getBackendUrl: () => 'https://backend.example.com',
}));

import { GET } from './route';

function createRequest(headers?: Record<string, string>) {
  return {
    headers: new Headers(headers),
    nextUrl: new URL('https://app.kloel.com/api/chat/visitor/session'),
  } as any;
}

describe('chat visitor session proxy route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('forwards the request to the backend visitor session endpoint', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ sessionId: 'visitor_123' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const response = await GET(createRequest({ 'x-forwarded-for': '1.1.1.1' }));

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://backend.example.com/chat/visitor/session',
      expect.objectContaining({
        method: 'GET',
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ sessionId: 'visitor_123' });
  });
});
