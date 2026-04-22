import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET, HEAD, OPTIONS, POST } from './route';

function createRequest(options?: { body?: string; signature?: string | null }) {
  return {
    headers: new Headers(
      options?.signature
        ? {
            'content-type': 'application/json',
            'tiktok-signature': options.signature,
          }
        : {
            'content-type': 'application/json',
          },
    ),
    text: vi.fn(async () => options?.body || '{"ping":true}'),
  } as any;
}

describe('tiktok webhook route', () => {
  const originalSecret = process.env.TIKTOK_CLIENT_SECRET;

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.TIKTOK_CLIENT_SECRET;
    } else {
      process.env.TIKTOK_CLIENT_SECRET = originalSecret;
    }
  });

  it('returns health metadata on GET', async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      provider: 'tiktok',
      callbackUrl: '/api/webhooks/tiktok',
      accepts: ['GET', 'HEAD', 'OPTIONS', 'POST'],
    });
  });

  it('supports HEAD and OPTIONS for callback probes', async () => {
    expect((await HEAD()).status).toBe(200);
    expect((await OPTIONS()).status).toBe(204);
  });

  it('acknowledges unsigned POST probes', async () => {
    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
  });

  it('accepts a valid hex signature', async () => {
    process.env.TIKTOK_CLIENT_SECRET = 'tiktok-secret';
    const body = '{"ping":true}';
    const timestamp = '1710000000';
    const signature = createHmac('sha256', process.env.TIKTOK_CLIENT_SECRET)
      .update(`${timestamp}.${body}`)
      .digest('hex');

    const response = await POST(
      createRequest({ body, signature: `t=${timestamp},s=${signature}` }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
  });

  it('accepts a valid base64 signature', async () => {
    process.env.TIKTOK_CLIENT_SECRET = 'tiktok-secret';
    const body = '{"ping":true}';
    const timestamp = '1710000000';
    const signature = createHmac('sha256', process.env.TIKTOK_CLIENT_SECRET)
      .update(`${timestamp}.${body}`)
      .digest('base64');

    const response = await POST(
      createRequest({ body, signature: `t=${timestamp},s=${signature}` }),
    );

    expect(response.status).toBe(200);
  });

  it('rejects malformed signatures', async () => {
    process.env.TIKTOK_CLIENT_SECRET = 'tiktok-secret';

    const response = await POST(createRequest({ signature: 'not-valid' }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: 'Malformed TikTok webhook signature',
    });
  });
});
