import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockedSetSharedAuthCookies, mockedRevalidateTag, mockedGetBackendUrl } = vi.hoisted(() => ({
  mockedSetSharedAuthCookies: vi.fn(),
  mockedRevalidateTag: vi.fn(),
  mockedGetBackendUrl: vi.fn(() => 'https://backend.example.com'),
}));

vi.mock('next/cache', () => ({
  revalidateTag: mockedRevalidateTag,
}));

vi.mock('../../_lib/backend-url', () => ({
  getBackendUrl: mockedGetBackendUrl,
}));

vi.mock('../_lib/shared-auth-cookies', () => ({
  setSharedAuthCookies: mockedSetSharedAuthCookies,
  hasSharedAuthToken: (payload: Record<string, unknown> | null | undefined) =>
    Boolean(payload?.access_token || payload?.accessToken),
}));

import { POST } from './route';

function createRequest(options?: {
  body?: Record<string, unknown>;
  url?: string;
}) {
  return {
    headers: new Headers(),
    nextUrl: new URL(options?.url || 'https://auth.kloel.com/api/auth/refresh'),
    json: vi.fn(async () => options?.body || {}),
  } as any;
}

describe('refresh auth proxy route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockedSetSharedAuthCookies.mockReset();
    mockedRevalidateTag.mockReset();
    mockedGetBackendUrl.mockReset();
    mockedGetBackendUrl.mockReturnValue('https://backend.example.com');
  });

  it('revalidates auth and sets cookies for camelCase refresh payloads', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
          workspace: { id: 'ws-refresh' },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    const response = await POST(createRequest({ body: { refreshToken: 'old-refresh-token' } }));

    expect(mockedRevalidateTag).toHaveBeenCalledWith('auth', 'max');
    expect(mockedSetSharedAuthCookies).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
  });

  it('fails explicitly when BACKEND_URL is not configured', async () => {
    mockedGetBackendUrl.mockReturnValue('');

    const response = await POST(createRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ message: 'Servidor não configurado.' });
  });
});
