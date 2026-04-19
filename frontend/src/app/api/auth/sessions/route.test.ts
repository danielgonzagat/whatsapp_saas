import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockedGetBackendUrl } = vi.hoisted(() => ({
  mockedGetBackendUrl: vi.fn(() => 'https://backend.example.com'),
}));

vi.mock('../../_lib/backend-url', () => ({
  getBackendUrl: mockedGetBackendUrl,
}));

import { GET } from './route';

function createRequest(options?: {
  headers?: Record<string, string>;
  url?: string;
}) {
  return {
    headers: new Headers(options?.headers),
    nextUrl: new URL(options?.url || 'https://auth.kloel.com/api/auth/sessions'),
  } as any;
}

describe('auth sessions proxy route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockedGetBackendUrl.mockReset();
    mockedGetBackendUrl.mockReturnValue('https://backend.example.com');
  });

  it('forwards cookies and authorization headers to the backend', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          sessions: [
            {
              id: 'session-1',
              isCurrent: true,
              device: 'MacBook Pro',
              detail: 'Chrome on macOS',
              deviceType: 'desktop',
              createdAt: '2026-04-19T00:00:00.000Z',
              lastUsedAt: '2026-04-19T01:00:00.000Z',
              expiresAt: '2026-04-26T01:00:00.000Z',
            },
          ],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    const response = await GET(
      createRequest({
        headers: {
          cookie: 'kloel_access_token=token',
          authorization: 'Bearer token',
          'x-forwarded-for': '1.1.1.1',
        },
      }),
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://backend.example.com/auth/sessions',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Cookie: 'kloel_access_token=token',
          Authorization: 'Bearer token',
          'X-Forwarded-For': '1.1.1.1',
        }),
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      sessions: [
        {
          id: 'session-1',
          isCurrent: true,
          device: 'MacBook Pro',
          detail: 'Chrome on macOS',
          deviceType: 'desktop',
          createdAt: '2026-04-19T00:00:00.000Z',
          lastUsedAt: '2026-04-19T01:00:00.000Z',
          expiresAt: '2026-04-26T01:00:00.000Z',
        },
      ],
    });
  });

  it('fails explicitly when BACKEND_URL is not configured', async () => {
    mockedGetBackendUrl.mockReturnValue('');

    const response = await GET(createRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      message: 'Servidor não configurado.',
    });
  });
});
