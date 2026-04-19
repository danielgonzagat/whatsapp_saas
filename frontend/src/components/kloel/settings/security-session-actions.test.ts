import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockedSignOut, mockedBuildMarketingUrl } = vi.hoisted(() => ({
  mockedSignOut: vi.fn(),
  mockedBuildMarketingUrl: vi.fn((path: string) => `https://kloel.com${path}`),
}));

vi.mock('@/lib/api', () => ({
  authApi: {
    signOut: mockedSignOut,
  },
}));

vi.mock('@/lib/subdomains', () => ({
  buildMarketingUrl: mockedBuildMarketingUrl,
}));

import { signOutCurrentKloelSession } from './security-session-actions';

describe('signOutCurrentKloelSession', () => {
  const originalLocation = window.location;
  const assignSpy = vi.fn();

  beforeEach(() => {
    mockedSignOut.mockReset();
    mockedSignOut.mockResolvedValue(undefined);
    mockedBuildMarketingUrl.mockClear();
    assignSpy.mockReset();

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        host: 'app.kloel.com',
        assign: assignSpy,
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('signs out and redirects to the canonical login URL', async () => {
    await signOutCurrentKloelSession();

    expect(mockedSignOut).toHaveBeenCalledTimes(1);
    expect(mockedBuildMarketingUrl).toHaveBeenCalledWith('/login', 'app.kloel.com');
    expect(assignSpy).toHaveBeenCalledWith('https://kloel.com/login');
  });
});
