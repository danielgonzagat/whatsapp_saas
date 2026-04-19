import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to mock http before importing api, since api imports from http
vi.mock('../http', () => ({
  API_BASE: 'http://localhost:3001',
  apiUrl: (path: string) => `http://localhost:3001${path.startsWith('/') ? path : '/' + path}`,
}));

import {
  authApi,
  tokenStorage,
  apiFetch,
  buildWhatsAppScreencastWsUrl,
  initiateWhatsAppConnection,
  getWhatsAppStatus,
  getWhatsAppQR,
  getWhatsAppScreencastToken,
  getWhatsAppViewer,
  linkWhatsAppSession,
  resolveWorkspaceFromAuthPayload,
  whatsappApi,
} from '../api';
import { hasAuthenticatedKloelToken, isAnonymousKloelToken } from '../auth-identity';

function createTestJwt(payload: Record<string, unknown>) {
  const encoded = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

  return `header.${encoded}.signature`;
}

describe('tokenStorage', () => {
  beforeEach(() => {
    tokenStorage.clear();
  });

  it('stores and retrieves access token', () => {
    expect(tokenStorage.getToken()).toBeNull();
    tokenStorage.setToken('my-access-token');
    expect(tokenStorage.getToken()).toBe('my-access-token');
  });

  it('does not mark visitor token as authenticated session', () => {
    const guestToken = createTestJwt({
      sub: 'visitor-agent',
      email: 'visitor_123@visitor.kloel.local',
      workspaceId: 'ws-guest',
      name: 'Visitante',
    });

    tokenStorage.setToken(guestToken);

    expect(tokenStorage.getToken()).toBe(guestToken);
    expect(document.cookie).not.toContain('kloel_auth=1');
  });

  it('stores and retrieves refresh token', () => {
    expect(tokenStorage.getRefreshToken()).toBeNull();
    tokenStorage.setRefreshToken('my-refresh-token');
    expect(tokenStorage.getRefreshToken()).toBe('my-refresh-token');
  });

  it('stores and retrieves workspace id', () => {
    expect(tokenStorage.getWorkspaceId()).toBeNull();
    tokenStorage.setWorkspaceId('ws-123');
    expect(tokenStorage.getWorkspaceId()).toBe('ws-123');
  });

  it('reconciles stale workspace id from jwt payload', () => {
    tokenStorage.setToken(createTestJwt({ workspaceId: 'ws-token' }));
    tokenStorage.setWorkspaceId('ws-stale');

    expect(tokenStorage.getWorkspaceId()).toBe('ws-token');
  });

  it('clears all tokens', () => {
    tokenStorage.setToken('tok');
    tokenStorage.setRefreshToken('ref');
    tokenStorage.setWorkspaceId('ws');
    tokenStorage.clear();
    expect(tokenStorage.getToken()).toBeNull();
    expect(tokenStorage.getRefreshToken()).toBeNull();
    expect(tokenStorage.getWorkspaceId()).toBeNull();
  });

  it('prefers authenticated access tokens when duplicate cookies are present', () => {
    const originalCookieDescriptor =
      Object.getOwnPropertyDescriptor(Document.prototype, 'cookie') ||
      Object.getOwnPropertyDescriptor(document, 'cookie');
    const realToken = createTestJwt({
      sub: 'agent-1',
      email: 'danielgonzagatj@gmail.com',
      workspaceId: 'ws-real',
      name: 'Daniel Gonzaga',
      exp: 9999999999,
    });
    const guestToken = createTestJwt({
      sub: 'visitor-agent',
      email: 'visitor_123@visitor.kloel.local',
      workspaceId: 'ws-guest',
      name: 'Visitante',
    });

    let cookieValue = [
      `kloel_access_token=${encodeURIComponent(guestToken)}`,
      `kloel_access_token=${encodeURIComponent(realToken)}`,
      `kloel_auth=1`,
    ].join('; ');

    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => cookieValue,
      set: vi.fn((nextValue: string) => {
        cookieValue = cookieValue ? `${cookieValue}; ${nextValue}` : nextValue;
      }),
    });

    expect(tokenStorage.getToken()).toBe(realToken);

    if (originalCookieDescriptor) {
      Object.defineProperty(document, 'cookie', originalCookieDescriptor);
    }
  });
});

describe('apiFetch', () => {
  beforeEach(() => {
    tokenStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('adds Authorization header when token is set', async () => {
    tokenStorage.setToken('test-token-123');

    const mockResponse = {
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true }),
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

    await apiFetch('/test-endpoint');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const callArgs = fetchSpy.mock.calls[0];
    const headers = callArgs[1]?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer test-token-123');
  });

  it('adds x-workspace-id header when workspace is set', async () => {
    tokenStorage.setToken('tok');
    tokenStorage.setWorkspaceId('ws-456');

    const mockResponse = {
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

    await apiFetch('/test');

    const headers = fetchSpy.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers['x-workspace-id']).toBe('ws-456');
  });

  it('returns error on non-ok response', async () => {
    const mockResponse = {
      ok: false,
      status: 422,
      json: () => Promise.resolve({ message: 'Validation failed' }),
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

    const result = await apiFetch('/test');

    expect(result.error).toBe('Validation failed');
    expect(result.status).toBe(422);
  });

  it('returns network error on fetch failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

    const result = await apiFetch('/test');

    expect(result.error).toBe('Network error');
    expect(result.status).toBe(0);
  });

  it('serializes object body to JSON', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

    await apiFetch('/test', {
      method: 'POST',
      body: { name: 'test', value: 42 },
    });

    const callBody = fetchSpy.mock.calls[0][1]?.body;
    expect(callBody).toBe(JSON.stringify({ name: 'test', value: 42 }));
  });

  it('routes marketing endpoints through the same-origin proxy', async () => {
    tokenStorage.setToken('tok');
    tokenStorage.setWorkspaceId('ws-789');

    const mockResponse = {
      ok: true,
      status: 200,
      json: () => Promise.resolve({ connected: false }),
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

    await apiFetch('/marketing/connect/status');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/marketing/connect/status',
      expect.objectContaining({
        credentials: 'include',
        headers: expect.objectContaining({
          Authorization: 'Bearer tok',
          'x-kloel-access-token': 'tok',
          'x-workspace-id': 'ws-789',
          'x-kloel-workspace-id': 'ws-789',
        }),
      }),
    );
  });
});

describe('authApi', () => {
  beforeEach(() => {
    tokenStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requests a magic link through the auth proxy', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true }),
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

    await authApi.requestMagicLink('magic@test.com');

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/auth/magic-link/request',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'magic@test.com' }),
      }),
    );
  });

  it('exports authenticated account data through the compliance endpoint', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          exportedAt: '2026-04-18T12:00:00.000Z',
          user: { id: 'agent-1', email: 'magic@test.com' },
        }),
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

    await authApi.exportMyData();

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/user/data-export'),
      expect.objectContaining({}),
    );
  });

  it('requests self-service account deletion through the compliance endpoint', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          confirmationCode: 'CONFIRM123456789',
          status: 'completed',
        }),
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

    await authApi.requestDataDeletion();

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/user/data-deletion'),
      expect.objectContaining({
        method: 'DELETE',
      }),
    );
  });

  it('loads the authenticated Google extended profile through the frontend proxy', async () => {
    tokenStorage.setToken('auth-token');

    const mockResponse = {
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          provider: 'google',
          email: 'daniel@kloel.com',
          phone: '+5562999990000',
          birthday: '1994-04-18',
          address: {
            street: 'Rua 1',
            city: 'Caldas Novas',
            state: 'GO',
            postalCode: '75694-720',
            countryCode: 'BR',
            formattedValue: 'Rua 1, Caldas Novas - GO',
          },
        }),
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

    await authApi.getGoogleExtendedProfile('google-access-token');

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/user/google-profile-extended',
      expect.objectContaining({
        method: 'GET',
        credentials: 'include',
        headers: expect.objectContaining({
          Authorization: 'Bearer auth-token',
          'X-Google-Access-Token': 'google-access-token',
          'x-kloel-access-token': 'auth-token',
        }),
      }),
    );
  });

  it('consumes a magic link and persists the returned auth payload', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          access_token: 'magic-access-token',
          refresh_token: 'magic-refresh-token',
          user: { id: 'agent-1', email: 'magic@test.com', workspaceId: 'ws-1' },
          workspace: { id: 'ws-1', name: 'Magic Workspace' },
        }),
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

    await authApi.consumeMagicLink('magic-token');

    expect(tokenStorage.getToken()).toBe('magic-access-token');
    expect(tokenStorage.getRefreshToken()).toBe('magic-refresh-token');
    expect(tokenStorage.getWorkspaceId()).toBe('ws-1');
  });

  it('forwards optional account-link confirmation tokens when consuming a magic link', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          access_token: 'magic-access-token',
          refresh_token: 'magic-refresh-token',
          user: { id: 'agent-1', email: 'magic@test.com', workspaceId: 'ws-1' },
          workspace: { id: 'ws-1', name: 'Magic Workspace' },
        }),
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

    await authApi.consumeMagicLink('magic-token', 'link-token');

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/auth/magic-link/consume',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ token: 'magic-token', linkToken: 'link-token' }),
      }),
    );
  });

  it('revokes the current backend session before clearing local auth state on sign out', async () => {
    tokenStorage.setToken('auth-token');
    tokenStorage.setRefreshToken('refresh-token');
    tokenStorage.setWorkspaceId('ws-1');

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response);

    await authApi.signOut();

    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      '/api/auth/sessions/revoke-current',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      '/api/auth/logout',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
      }),
    );
    expect(tokenStorage.getToken()).toBeNull();
    expect(tokenStorage.getRefreshToken()).toBeNull();
    expect(tokenStorage.getWorkspaceId()).toBeNull();
  });

  it('still clears local auth state if revoke-current fails during sign out', async () => {
    tokenStorage.setToken('auth-token');
    tokenStorage.setRefreshToken('refresh-token');
    tokenStorage.setWorkspaceId('ws-1');

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('revoke failed'))
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response);

    await authApi.signOut();

    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      '/api/auth/sessions/revoke-current',
      expect.any(Object),
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      '/api/auth/logout',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
      }),
    );
    expect(tokenStorage.getToken()).toBeNull();
    expect(tokenStorage.getRefreshToken()).toBeNull();
    expect(tokenStorage.getWorkspaceId()).toBeNull();
  });
});

describe('whatsappApi fallbacks', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes legacy runtime status payloads before exposing them to the browser', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          connected: false,
          status: 'SCAN_QR_CODE',
          provider: 'whatsapp-api',
          qrCode: 'data:image/png;base64,legacy',
          qrAvailable: true,
          activeProvider: 'whatsapp-api',
          browserSessionStatus: 'OPENING',
          screencastStatus: 'READY',
          viewerAvailable: true,
          message: 'Abra o fluxo oficial da Meta.',
        }),
    } as Response);

    const response = await getWhatsAppStatus('ws-1');

    expect(response).toMatchObject({
      connected: false,
      status: 'connecting',
      provider: 'legacy-runtime',
      activeProvider: 'legacy-runtime',
      qrCode: undefined,
      qrAvailable: false,
      viewerAvailable: false,
      browserSessionStatus: undefined,
      screencastStatus: undefined,
      message: 'Abra o fluxo oficial da Meta.',
    });
  });

  it('returns a local Meta-only sentinel for the deprecated QR helper without calling the QR proxy', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const response = await getWhatsAppQR('ws-1');

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(response).toEqual({
      qrCode: null,
      connected: false,
      status: 'legacy_disabled',
      message: 'Runtime legado descontinuado. Use a integração Meta.',
    });
  });

  it('does not propagate qr fields from the public session start route anymore', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          success: true,
          message: 'legacy_runtime_disabled',
          qrCode: 'data:image/png;base64,legacy',
          qrCodeImage: 'data:image/png;base64,legacy-image',
        }),
    } as Response);

    const response = await initiateWhatsAppConnection('ws-1');

    expect(response).toEqual({
      status: 'pending',
      message: 'O runtime legado foi descontinuado. Abra o fluxo oficial da Meta.',
      authUrl: undefined,
      error: false,
    });
  });

  it('humanizes missing Embedded Signup configuration from the public session start route', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          success: false,
          message: 'meta_embedded_signup_not_configured',
        }),
    } as Response);

    const response = await initiateWhatsAppConnection('ws-1');

    expect(response).toEqual({
      status: 'error',
      message: 'Meta Embedded Signup não configurado no servidor.',
      authUrl: undefined,
      error: true,
    });
  });

  it('returns a 410-style sentinel for whatsappApi.getQrCode without hitting the legacy runtime route', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const response = await whatsappApi.getQrCode();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      statusCode: 410,
      success: false,
      available: false,
      provider: 'meta-cloud',
      feature: 'qr_code',
      notSupported: true,
      reason: 'qr_code_not_supported_for_meta_cloud',
      message: 'Descontinuado. Use a integração Meta.',
      status: 410,
    });
  });

  it('returns a local 410 sentinel for guest session claim without calling the legacy route', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const response = await whatsappApi.claimSession('ws-guest');

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      statusCode: 410,
      success: false,
      provider: 'meta-cloud',
      feature: 'legacy_session_claim',
      notSupported: true,
      reason: 'legacy_session_claim_not_supported_for_meta_cloud',
      message: 'Descontinuado. Use a integração Meta.',
      status: 410,
    });
  });

  it('returns a local 410 sentinel for the deprecated viewer surface without calling fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const response = await whatsappApi.getViewer();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      statusCode: 410,
      success: false,
      provider: 'meta-cloud',
      feature: 'viewer',
      notSupported: true,
      reason: 'viewer_not_supported_for_meta_cloud',
      message: 'Descontinuado. Use a integração Meta.',
      status: 410,
    });
  });

  it('reports the disabled viewer as meta-cloud-only instead of legacy whatsapp-api', async () => {
    const viewer = (await getWhatsAppViewer('ws-1')) as {
      provider: string;
      snapshot: { viewerAvailable: boolean; state: string };
      message: string;
    };

    expect(viewer.provider).toBe('meta-cloud');
    expect(viewer.snapshot.viewerAvailable).toBe(false);
    expect(viewer.snapshot.state).toBe('NOT_SUPPORTED');
    expect(viewer.message).toContain('Viewer/browser session');
  });

  it('returns a meta-cloud-disabled screencast sentinel for the disabled viewer surface', async () => {
    const token = await getWhatsAppScreencastToken('ws-1');

    expect(token).toMatchObject({
      token: 'meta-cloud-disabled',
      workspaceId: 'ws-1',
      requireToken: false,
    });
  });

  it('uses visitor as the default screencast token marker', () => {
    const originalScreenCastUrl = process.env.NEXT_PUBLIC_SCREENCAST_WS_URL;
    process.env.NEXT_PUBLIC_SCREENCAST_WS_URL = 'wss://screen.kloel.com';

    try {
      expect(buildWhatsAppScreencastWsUrl('ws-1')).toBe(
        'wss://screen.kloel.com/stream/ws-1?token=visitor',
      );
    } finally {
      if (originalScreenCastUrl === undefined) {
        delete process.env.NEXT_PUBLIC_SCREENCAST_WS_URL;
      } else {
        process.env.NEXT_PUBLIC_SCREENCAST_WS_URL = originalScreenCastUrl;
      }
    }
  });

  it('returns a local sentinel for manual legacy session linking without calling fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const response = await linkWhatsAppSession('ws-1', 'legacy-session');

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      success: false,
      provider: 'meta-cloud',
      feature: 'legacy_session_link',
      notSupported: true,
      reason: 'legacy_session_link_not_supported_for_meta_cloud',
      message: 'Descontinuado. Use a integração Meta.',
    });
  });
});

describe('resolveWorkspaceFromAuthPayload', () => {
  it('returns null for empty payload', () => {
    expect(resolveWorkspaceFromAuthPayload(null)).toBeNull();
    expect(resolveWorkspaceFromAuthPayload({})).toBeNull();
  });

  it('extracts workspace from explicit workspace field', () => {
    const payload = { workspace: { id: 'ws-1', name: 'My WS' } };
    expect(resolveWorkspaceFromAuthPayload(payload)).toEqual({ id: 'ws-1', name: 'My WS' });
  });

  it('extracts workspace from user.workspaceId', () => {
    const payload = {
      user: { workspaceId: 'ws-2', workspaceName: 'Second' },
      workspaces: [],
    };
    const result = resolveWorkspaceFromAuthPayload(payload);
    expect(result).toEqual({ id: 'ws-2', name: 'Second' });
  });

  it('matches workspaceId against workspaces array', () => {
    const payload = {
      user: { workspaceId: 'ws-3' },
      workspaces: [
        { id: 'ws-3', name: 'Matched WS' },
        { id: 'ws-4', name: 'Other' },
      ],
    };
    const result = resolveWorkspaceFromAuthPayload(payload);
    expect(result).toEqual({ id: 'ws-3', name: 'Matched WS' });
  });

  it('falls back to first workspace when no workspaceId on user', () => {
    const payload = {
      user: {},
      workspaces: [{ id: 'ws-first', name: 'First' }],
    };
    const result = resolveWorkspaceFromAuthPayload(payload);
    expect(result).toEqual({ id: 'ws-first', name: 'First' });
  });
});

describe('auth identity helpers', () => {
  it('detects anonymous visitor tokens', () => {
    const guestToken = createTestJwt({
      sub: 'visitor-agent',
      email: 'visitor_123@visitor.kloel.local',
      workspaceId: 'ws-guest',
    });

    expect(isAnonymousKloelToken(guestToken)).toBe(true);
    expect(hasAuthenticatedKloelToken(guestToken)).toBe(false);
  });

  it('keeps detecting legacy guest tokens as anonymous', () => {
    const guestToken = createTestJwt({
      sub: 'guest-agent',
      email: 'guest_123@guest.kloel.local',
      workspaceId: 'ws-guest',
    });

    expect(isAnonymousKloelToken(guestToken)).toBe(true);
    expect(hasAuthenticatedKloelToken(guestToken)).toBe(false);
  });

  it('accepts real authenticated tokens', () => {
    const realToken = createTestJwt({
      sub: 'agent-1',
      email: 'danielgonzagatj@gmail.com',
      workspaceId: 'ws-real',
      name: 'Daniel',
    });

    expect(isAnonymousKloelToken(realToken)).toBe(false);
    expect(hasAuthenticatedKloelToken(realToken)).toBe(true);
  });
});
