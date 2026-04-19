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
  url?: string;
}) {
  return {
    headers: new Headers(options?.headers),
    nextUrl: new URL(options?.url || 'https://auth.kloel.com/api/auth/sessions/revoke-others'),
  } as any;
}

describe('revoke-other-sessions proxy route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockedGetBackendUrl.mockReset();
    mockedGetBackendUrl.mockReturnValue('https://backend.example.com');
  });

  it('forwards the authenticated revoke-others request to the backend', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, revokedCount: 3 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const response = await POST(
      createRequest({
        headers: {
          cookie: 'kloel_access_token=token',
          authorization: 'Bearer token',
          'x-forwarded-for': '1.1.1.1',
        },
      }),
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://backend.example.com/auth/sessions/revoke-others',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({}),
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
