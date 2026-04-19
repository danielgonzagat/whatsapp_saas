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
    nextUrl: new URL(options?.url || 'https://auth.kloel.com/api/auth/magic-link/request'),
    json: vi.fn(async () => options?.body || {}),
  } as any;
}

describe('magic-link request proxy route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockedGetBackendUrl.mockReset();
    mockedGetBackendUrl.mockReturnValue('https://backend.example.com');
  });

  it('forwards the request to the backend and preserves the response payload', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          message: 'Magic link enviado.',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    const response = await POST(
      createRequest({
        body: { email: 'daniel@kloel.com' },
        headers: { 'x-forwarded-for': '1.1.1.1' },
      }),
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://backend.example.com/auth/magic-link/request',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'daniel@kloel.com' }),
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: 'Magic link enviado.',
    });
  });

  it('fails explicitly when BACKEND_URL is not configured', async () => {
    mockedGetBackendUrl.mockReturnValue('');

    const response = await POST(createRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      message: 'Servidor não configurado.',
    });
  });
});
