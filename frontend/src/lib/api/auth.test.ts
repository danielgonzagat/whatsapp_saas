import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { authApi } from './auth';

beforeEach(() => {
  document.cookie = 'kloel_access_token=test-token; path=/';
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      data: { access_token: 'jwt-abc', user: { id: 'u1', email: 'a@b.com' } },
    }),
  } as Response);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function lastFetch(): { url: string; method: string; headers: Record<string, string> } {
  const call = vi.mocked(globalThis.fetch).mock.calls.at(-1);
  const input = call?.[0];
  const url = input instanceof Request ? input.url : String(input ?? '');
  const method = input instanceof Request ? input.method : 'GET';
  const headers: Record<string, string> = {};
  if (input instanceof Request) input.headers.forEach((v, k) => { headers[k] = v; });
  return { url, method, headers };
}

describe('authApi', () => {
  describe('signUp', () => {
    it('POSTs to /auth/register', async () => {
      await authApi.signUp('a@b.com', 'Alice', 'secret');
      const { url, method } = lastFetch();
      expect(method).toBe('POST');
      expect(url).toContain('/auth/register');
    });

    it('sends Authorization header', async () => {
      await authApi.signUp('a@b.com', 'Alice', 'secret');
      expect(lastFetch().headers.authorization).toBe('Bearer test-token');
    });
  });

  describe('signIn', () => {
    it('POSTs to /auth/login', async () => {
      await authApi.signIn('a@b.com', 'secret');
      const { url, method } = lastFetch();
      expect(method).toBe('POST');
      expect(url).toContain('/auth/login');
    });
  });

  describe('getMe', () => {
    it('GETs /workspace/me', async () => {
      await authApi.getMe();
      const { url, method } = lastFetch();
      expect(method).toBe('GET');
      expect(url).toContain('/workspace/me');
    });

    it('returns the auth payload', async () => {
      const res = await authApi.getMe();
      expect(res.data).toBeDefined();
    });
  });

  describe('forgotPassword', () => {
    it('POSTs to /auth/forgot-password', async () => {
      await authApi.forgotPassword('a@b.com');
      const { url, method } = lastFetch();
      expect(method).toBe('POST');
      expect(url).toContain('/auth/forgot-password');
    });
  });

  describe('error handling', () => {
    it('propagates network error message', async () => {
      vi.mocked(globalThis.fetch).mockRejectedValue(new Error('Network down'));
      const res = await authApi.signIn('a@b.com', 'secret');
      expect(res.error).toBe('Network down');
    });

    it('returns error string on non-ok response', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ message: 'Invalid credentials' }),
      } as Response);
      const res = await authApi.signIn('a@b.com', 'wrong');
      expect(res.error).toBeTruthy();
      expect(typeof res.error).toBe('string');
    });
  });
});
