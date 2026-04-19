import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockedGetBackendUrl } = vi.hoisted(() => ({
  mockedGetBackendUrl: vi.fn(() => 'https://backend.example.com'),
}));

vi.mock('../../../_lib/backend-url', () => ({
  getBackendUrl: mockedGetBackendUrl,
}));

import { POST } from './route';

function createRequest(options?: {
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  url?: string;
}) {
  return {
    headers: new Headers(options?.headers),
    nextUrl: new URL(options?.url || 'https://auth.kloel.com/api/auth/sessions/revoke'),
    json: vi.fn(async () => options?.body || {}),
  } as any;
}

describe('revoke-session proxy route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockedGetBackendUrl.mockReset();
    mockedGetBackendUrl.mockReturnValue('https://backend.example.com');
  });

  it('forwards auth headers and session id to the backend', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, revokedSessionId: 'session-2' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const response = await POST(
      createRequest({
        body: { sessionId: 'session-2' },
        headers: {
          cookie: 'kloel_access_token=token',
          authorization: 'Bearer token',
          'x-forwarded-for': '1.1.1.1',
        },
      }),
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://backend.example.com/auth/sessions/revoke',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ sessionId: 'session-2' }),
        headers: expect.objectContaining({
          Cookie: 'kloel_access_token=token',
          Authorization: 'Bearer token',
          'X-Forwarded-For': '1.1.1.1',
        }),
      }),
    );
    expect(response.status).toBe(200);
  });

  it('fails explicitly when BACKEND_URL is not configured', async () => {
    mockedGetBackendUrl.mockReturnValue('');

    const response = await POST(createRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ message: 'Servidor não configurado.' });
  });
});
