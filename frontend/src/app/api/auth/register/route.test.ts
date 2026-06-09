import { type NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  getBackendUrl: vi.fn(() => ''),
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

import { POST } from './route';

function createRequest(body: unknown) {
  return {
    headers: new Headers({ host: 'auth.kloel.com' }),
    json: async () => body,
  } as NextRequest;
}

describe('register auth proxy route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.revalidateTag.mockReset();
    mocks.getBackendUrl.mockReset();
    mocks.getBackendUrl.mockReturnValue('');
    mocks.setSharedAuthCookies.mockReset();
    mocks.setSharedAuthCookies.mockImplementation((_: unknown, response: Response) => response);
  });

  it('returns a controlled configuration error without logging a false system error', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const response = await POST(
        createRequest({
          email: 'admin+e2e@example.com',
          password: 'password',
          workspaceName: 'E2E Workspace',
        }),
      );

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        message: 'Servidor não configurado corretamente. Contate o suporte.',
      });
      expect(errorSpy).not.toHaveBeenCalled();
      expect(mocks.revalidateTag).not.toHaveBeenCalled();
      expect(mocks.setSharedAuthCookies).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });
});
