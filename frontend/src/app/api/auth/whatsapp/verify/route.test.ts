import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockedGetBackendCandidateUrls, mockedSetSharedAuthCookies, mockedRevalidateTag } =
  vi.hoisted(() => ({
    mockedGetBackendCandidateUrls: vi.fn(() => ['https://backend.example.com']),
    mockedSetSharedAuthCookies: vi.fn(),
    mockedRevalidateTag: vi.fn(),
  }));

vi.mock('next/cache', () => ({
  revalidateTag: mockedRevalidateTag,
}));

vi.mock('../../../_lib/backend-url', () => ({
  getBackendCandidateUrls: mockedGetBackendCandidateUrls,
}));

vi.mock('../../_lib/shared-auth-cookies', () => ({
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
    nextUrl: new URL(options?.url || 'https://auth.kloel.com/api/auth/whatsapp/verify'),
    json: vi.fn(async () => options?.body || {}),
  } as any;
}

describe('whatsapp verify auth proxy route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockedGetBackendCandidateUrls.mockReset();
    mockedGetBackendCandidateUrls.mockReturnValue(['https://backend.example.com']);
    mockedSetSharedAuthCookies.mockReset();
    mockedRevalidateTag.mockReset();
  });

  it('sets shared cookies for camelCase auth payloads returned by the backend', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          accessToken: 'whatsapp-access-token',
          refreshToken: 'whatsapp-refresh-token',
          workspace: { id: 'ws-whatsapp' },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    const response = await POST(
      createRequest({
        body: { phone: '+5511999999999', code: '123456' },
        headers: { 'x-forwarded-for': '1.1.1.1' },
      }),
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://backend.example.com/auth/whatsapp/verify',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ phone: '+5511999999999', code: '123456' }),
      }),
    );
    expect(mockedRevalidateTag).toHaveBeenCalledWith('auth', 'max');
    expect(mockedSetSharedAuthCookies).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      accessToken: 'whatsapp-access-token',
      refreshToken: 'whatsapp-refresh-token',
      workspace: { id: 'ws-whatsapp' },
    });
  });

  it('fails explicitly when BACKEND_URL is not configured', async () => {
    mockedGetBackendCandidateUrls.mockReturnValue([]);

    const response = await POST(createRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      message: 'Servidor não configurado.',
    });
    expect(mockedSetSharedAuthCookies).not.toHaveBeenCalled();
  });
});
