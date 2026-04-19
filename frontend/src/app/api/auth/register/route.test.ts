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
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  url?: string;
}) {
  return {
    headers: new Headers(options?.headers),
    nextUrl: new URL(options?.url || 'https://auth.kloel.com/api/auth/register'),
    json: vi.fn(async () => options?.body || {}),
  } as any;
}

describe('register auth proxy route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockedSetSharedAuthCookies.mockReset();
    mockedRevalidateTag.mockReset();
    mockedGetBackendUrl.mockReset();
    mockedGetBackendUrl.mockReturnValue('https://backend.example.com');
  });

  it('derives the name from email when absent and sets shared cookies for camelCase auth payloads', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          accessToken: 'kloel-access-token',
          refreshToken: 'kloel-refresh-token',
          workspace: { id: 'ws-register' },
        }),
        {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    const response = await POST(
      createRequest({
        body: { email: 'daniel.penin@kloel.com', password: 'very-secret-password' },
        headers: { 'x-forwarded-for': '1.1.1.1' },
      }),
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://backend.example.com/auth/register',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          name: 'Daniel penin',
          email: 'daniel.penin@kloel.com',
          password: 'very-secret-password',
          workspaceName: "Daniel penin's Workspace",
        }),
      }),
    );
    expect(mockedRevalidateTag).toHaveBeenCalledWith('auth', 'max');
    expect(mockedSetSharedAuthCookies).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(201);
  });

  it('fails explicitly when BACKEND_URL is not configured', async () => {
    mockedGetBackendUrl.mockReturnValue('');

    const response = await POST(
      createRequest({
        body: { email: 'daniel@kloel.com', password: 'very-secret-password' },
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      message: 'Servidor não configurado.',
    });
    expect(mockedSetSharedAuthCookies).not.toHaveBeenCalled();
  });
});
