import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockedGetBackendCandidateUrls, mockedRevalidateTag } = vi.hoisted(() => ({
  mockedGetBackendCandidateUrls: vi.fn(() => ['https://backend.example.com']),
  mockedRevalidateTag: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidateTag: mockedRevalidateTag,
}));

vi.mock('../../_lib/backend-url', () => ({
  getBackendCandidateUrls: mockedGetBackendCandidateUrls,
}));

import { POST } from './route';

function createRequest(options?: { headers?: Record<string, string>; url?: string }) {
  return {
    headers: new Headers(options?.headers),
    nextUrl: new URL(options?.url || 'https://auth.kloel.com/api/auth/anonymous'),
  } as any;
}

describe('anonymous auth proxy route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockedGetBackendCandidateUrls.mockReset();
    mockedGetBackendCandidateUrls.mockReturnValue(['https://backend.example.com']);
    mockedRevalidateTag.mockReset();
  });

  it('creates an anonymous session through the backend candidate and revalidates auth', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, user: { id: 'anon-user' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const response = await POST(
      createRequest({
        headers: { 'x-forwarded-for': '1.1.1.1' },
      }),
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://backend.example.com/auth/anonymous',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(mockedRevalidateTag).toHaveBeenCalledWith('auth', 'max');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      user: { id: 'anon-user' },
    });
  });

  it('fails explicitly when BACKEND_URL is not configured', async () => {
    mockedGetBackendCandidateUrls.mockReturnValue([]);

    const response = await POST(createRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      message: 'Servidor não configurado.',
    });
  });
});
