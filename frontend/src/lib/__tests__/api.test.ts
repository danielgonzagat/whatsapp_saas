import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to mock http before importing api, since api imports from http
vi.mock('../http', () => ({
  API_BASE: 'http://localhost:3001',
  apiUrl: (path: string) => `http://localhost:3001${path.startsWith('/') ? path : '/' + path}`,
}));

import { tokenStorage, apiFetch, resolveWorkspaceFromAuthPayload } from '../api';
import { hasAuthenticatedKloelToken, isAnonymousKloelToken } from '../auth-identity';

function createTestJwt(payload: Record<string, unknown>) {
  const encoded = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

  return `header.${encoded}.signature`;
}

function getFetchRequest(fetchSpy: { mock: { calls: unknown[][] } }) {
  return fetchSpy.mock.calls[0]?.[0] as Request;
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

  it('does not mark guest token as authenticated session', () => {
    const guestToken = createTestJwt({
      sub: 'guest-agent',
      email: 'guest_123@guest.kloel.local',
      workspaceId: 'ws-guest',
      name: 'Guest',
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
      sub: 'guest-agent',
      email: 'guest_123@guest.kloel.local',
      workspaceId: 'ws-guest',
      name: 'Guest',
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
    const request = getFetchRequest(fetchSpy);
    expect(request.headers.get('Authorization')).toBe('Bearer test-token-123');
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

    const request = getFetchRequest(fetchSpy);
    expect(request.headers.get('x-workspace-id')).toBe('ws-456');
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

    const request = getFetchRequest(fetchSpy);
    await expect(request.text()).resolves.toBe(JSON.stringify({ name: 'test', value: 42 }));
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
    const request = getFetchRequest(fetchSpy);
    expect(request.url).toBe(new URL('/api/marketing/connect/status', window.location.origin).href);
    expect(request.credentials).toBe('include');
    expect(request.headers.get('Authorization')).toBe('Bearer tok');
    expect(request.headers.get('x-kloel-access-token')).toBe('tok');
    expect(request.headers.get('x-workspace-id')).toBe('ws-789');
    expect(request.headers.get('x-kloel-workspace-id')).toBe('ws-789');
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
  it('detects anonymous guest tokens', () => {
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
