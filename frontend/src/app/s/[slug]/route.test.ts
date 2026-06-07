import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/app/(checkout)/server-api-base', () => ({
  getServerApiBase: () => 'https://backend.example.com',
}));

import { GET } from './route';

describe('public site route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('serves published site HTML from the backend public site endpoint', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<!doctype html><html><body>Site real</body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }),
    );

    const response = await GET(new Request('https://app.kloel.com/s/site-real'), {
      params: Promise.resolve({ slug: 'site-real' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=60, s-maxage=60');
    await expect(response.text()).resolves.toContain('Site real');
    expect(fetchSpy).toHaveBeenCalledWith('https://backend.example.com/s/site-real', {
      cache: 'no-store',
    });
  });

  it('rejects invalid site slugs before contacting the backend', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const response = await GET(new Request('https://app.kloel.com/s/../admin'), {
      params: Promise.resolve({ slug: '../admin' }),
    });

    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.text()).resolves.toContain('Pagina nao encontrada');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not cache backend failures', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html><body>Nao encontrado</body></html>', { status: 404 }),
    );

    const response = await GET(new Request('https://app.kloel.com/s/missing-site'), {
      params: Promise.resolve({ slug: 'missing-site' }),
    });

    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.text()).resolves.toContain('Nao encontrado');
  });
});
