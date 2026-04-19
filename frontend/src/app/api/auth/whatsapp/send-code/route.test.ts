import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockedGetBackendCandidateUrls, mockedRevalidateTag } = vi.hoisted(() => ({
  mockedGetBackendCandidateUrls: vi.fn(() => ['https://backend.example.com']),
  mockedRevalidateTag: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidateTag: mockedRevalidateTag,
}));

vi.mock('../../../_lib/backend-url', () => ({
  getBackendCandidateUrls: mockedGetBackendCandidateUrls,
}));

import { POST } from './route';

function createRequest(options?: {
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  url?: string;
}) {
  return {
    headers: new Headers(options?.headers),
    nextUrl: new URL(options?.url || 'https://auth.kloel.com/api/auth/whatsapp/send-code'),
    json: vi.fn(async () => options?.body || {}),
  } as any;
}

describe('whatsapp send-code auth proxy route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockedGetBackendCandidateUrls.mockReset();
    mockedGetBackendCandidateUrls.mockReturnValue(['https://backend.example.com']);
    mockedRevalidateTag.mockReset();
  });

  it('forwards the phone payload to the backend candidate and revalidates auth', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, channel: 'whatsapp' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const response = await POST(
      createRequest({
        body: { phone: '+5511999999999' },
        headers: { 'x-forwarded-for': '1.1.1.1' },
      }),
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://backend.example.com/auth/whatsapp/send-code',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ phone: '+5511999999999' }),
      }),
    );
    expect(mockedRevalidateTag).toHaveBeenCalledWith('auth', 'max');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      channel: 'whatsapp',
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
