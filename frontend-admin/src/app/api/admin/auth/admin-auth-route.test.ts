import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './[...path]/route';

const adminPayload = {
  id: 'admin-1',
  name: 'Daniel',
  email: 'daniel@example.com',
  role: 'OWNER',
};

interface AdminRequestInit {
  body?: BodyInit;
  headers?: HeadersInit;
}

function adminRequest(path: string[], init: AdminRequestInit = {}) {
  return {
    request: new NextRequest(`http://adm.kloel.local/api/admin/auth/${path.join('/')}`, {
      method: 'POST',
      ...init,
    }),
    context: { params: Promise.resolve({ path }) },
  };
}

describe('admin auth route', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stores refresh token in an httpOnly cookie and strips it from login JSON', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({
        state: 'authenticated',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        admin: adminPayload,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { request, context } = adminRequest(['login'], {
      body: JSON.stringify({ email: 'daniel@example.com', password: 'secret' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await POST(request, context);
    const payload = await response.json();

    expect(payload).toEqual({
      state: 'authenticated',
      accessToken: 'access-token',
      admin: adminPayload,
    });
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(response.headers.get('set-cookie')).toContain('kloel_admin_refresh=refresh-token');
  });

  it('refreshes through the httpOnly cookie instead of a client-provided body token', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({
        state: 'authenticated',
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        admin: adminPayload,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { request, context } = adminRequest(['refresh'], {
      headers: { cookie: 'kloel_admin_refresh=old-refresh-token' },
    });
    const response = await POST(request, context);
    const firstCall = fetchMock.mock.calls[0];
    const init = firstCall?.[1];

    expect(init?.body).toBe(JSON.stringify({ refreshToken: 'old-refresh-token' }));
    expect(await response.json()).toEqual({
      state: 'authenticated',
      accessToken: 'new-access-token',
      admin: adminPayload,
    });
    expect(response.headers.get('set-cookie')).toContain('kloel_admin_refresh=new-refresh-token');
  });

  it('clears the refresh cookie when refresh is attempted without a cookie', async () => {
    const { request, context } = adminRequest(['refresh']);
    const response = await POST(request, context);

    expect(response.status).toBe(401);
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });
});
