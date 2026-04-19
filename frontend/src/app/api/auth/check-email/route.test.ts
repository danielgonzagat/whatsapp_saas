import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockedGetBackendUrl, mockedRevalidateTag } = vi.hoisted(() => ({
  mockedGetBackendUrl: vi.fn(() => 'https://backend.example.com'),
  mockedRevalidateTag: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidateTag: mockedRevalidateTag,
}));

vi.mock('../../_lib/backend-url', () => ({
  getBackendUrl: mockedGetBackendUrl,
}));

import { GET, POST } from './route';

function createGetRequest(url = 'https://auth.kloel.com/api/auth/check-email?email=daniel%40kloel.com') {
  return {
    headers: new Headers(),
    url,
    nextUrl: new URL(url),
  } as any;
}

function createPostRequest(options?: {
  body?: Record<string, unknown>;
  url?: string;
}) {
  return {
    headers: new Headers(),
    nextUrl: new URL(options?.url || 'https://auth.kloel.com/api/auth/check-email'),
    json: vi.fn(async () => options?.body || {}),
  } as any;
}

describe('check-email auth proxy route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockedGetBackendUrl.mockReset();
    mockedGetBackendUrl.mockReturnValue('https://backend.example.com');
    mockedRevalidateTag.mockReset();
  });

  it('returns a hard 503 when the backend is not configured', async () => {
    mockedGetBackendUrl.mockReturnValue('');

    const getResponse = await GET(createGetRequest());
    const postResponse = await POST(createPostRequest({ body: { email: 'daniel@kloel.com' } }));

    expect(getResponse.status).toBe(503);
    await expect(getResponse.json()).resolves.toEqual({
      message: 'Servidor não configurado.',
    });

    expect(postResponse.status).toBe(503);
    await expect(postResponse.json()).resolves.toEqual({
      message: 'Servidor não configurado.',
    });
  });

  it('degrades gracefully to a soft success when the backend returns 5xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'temporarily unavailable' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const response = await GET(createGetRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      exists: false,
      degraded: true,
      message: 'temporarily unavailable',
    });
  });

  it('revalidates auth and returns POST existence checks from the backend', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ exists: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const response = await POST(createPostRequest({ body: { email: 'daniel@kloel.com' } }));

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://backend.example.com/auth/check-email',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'daniel@kloel.com' }),
      }),
    );
    expect(mockedRevalidateTag).toHaveBeenCalledWith('auth', 'max');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ exists: true });
  });
});
