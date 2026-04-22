import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('tiktok auth fallback callback route', () => {
  it('redirects the legacy callback path to the canonical API callback route', async () => {
    const response = await GET({
      url: 'https://auth.kloel.com/auth/tiktok/callback?code=tiktok-code&state=tiktok-state',
    } as any);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://auth.kloel.com/api/auth/callback/tiktok?code=tiktok-code&state=tiktok-state',
    );
  });
});
