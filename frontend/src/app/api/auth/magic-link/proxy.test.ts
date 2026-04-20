import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  getBackendUrl: vi.fn(() => 'https://backend.example.com'),
  setSharedAuthCookies: vi.fn((_: unknown, response: Response) => response),
}));

vi.mock('next/cache', () => ({
  revalidateTag: mocks.revalidateTag,
}));

vi.mock('../../_lib/backend-url', () => ({
  getBackendUrl: mocks.getBackendUrl,
}));

vi.mock('../_lib/shared-auth-cookies', () => ({
  setSharedAuthCookies: mocks.setSharedAuthCookies,
}));

import { POST as requestMagicLink } from './request/route';
import { POST as verifyMagicLink } from './verify/route';

function createRequest(body: unknown, forwardedFor = '198.51.100.5') {
  return {
    headers: new Headers({ 'x-forwarded-for': forwardedFor, host: 'auth.kloel.com' }),
    json: vi.fn(async () => body),
  } as any;
}

describe('magic-link proxy routes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.revalidateTag.mockReset();
    mocks.getBackendUrl.mockReset();
    mocks.getBackendUrl.mockReturnValue('https://backend.example.com');
    mocks.setSharedAuthCookies.mockReset();
    mocks.setSharedAuthCookies.mockImplementation((_: unknown, response: Response) => response);
  });

  it('forwards the magic-link request payload without setting cookies', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, message: 'Email sent' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const response = await requestMagicLink(
      createRequest({ email: 'user@kloel.com', redirectTo: '/dashboard' }),
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://backend.example.com/auth/magic-link/request',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Forwarded-For': '198.51.100.5',
        }),
        body: JSON.stringify({ email: 'user@kloel.com', redirectTo: '/dashboard' }),
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, message: 'Email sent' });
    expect(mocks.setSharedAuthCookies).not.toHaveBeenCalled();
  });

  it('verifies the magic link and sets shared cookies when auth tokens are returned', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          workspace: { id: 'ws_456' },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    const response = await verifyMagicLink(createRequest({ token: 'magic-token' }));

    expect(mocks.revalidateTag).toHaveBeenCalledWith('auth', 'max');
    expect(mocks.setSharedAuthCookies).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      workspace: { id: 'ws_456' },
    });
  });

  it('returns 503 for magic-link verify when the backend url is missing', async () => {
    mocks.getBackendUrl.mockReturnValue('');

    const response = await verifyMagicLink(createRequest({ token: 'magic-token' }, ''));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ message: 'Servidor não configurado.' });
    expect(mocks.setSharedAuthCookies).not.toHaveBeenCalled();
  });
});
