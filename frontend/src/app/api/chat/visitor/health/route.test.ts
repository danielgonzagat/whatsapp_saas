import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../_lib/backend-url', () => ({
  getBackendUrl: () => 'https://backend.example.com',
}));

import { GET } from './route';

function createRequest(headers?: Record<string, string>) {
  return {
    headers: new Headers(headers),
    nextUrl: new URL('https://app.kloel.com/api/chat/visitor/health'),
  } as any;
}

describe('chat visitor health proxy route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('forwards the request to the backend visitor health endpoint', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ mode: 'visitor', status: 'online' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const response = await GET(createRequest({ 'x-forwarded-for': '1.1.1.1' }));

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://backend.example.com/chat/visitor/health',
      expect.objectContaining({
        method: 'GET',
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ mode: 'visitor', status: 'online' });
  });
});
