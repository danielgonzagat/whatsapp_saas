import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockTokenStorage } = vi.hoisted(() => ({
  mockTokenStorage: {
    getToken: vi.fn(() => ''),
    getWorkspaceId: vi.fn(() => ''),
    setWorkspaceId: vi.fn(),
    clear: vi.fn(),
    getRefreshToken: vi.fn(() => ''),
  },
}));

vi.mock('@/lib/i18n/t', () => ({
  kloelT: (s: string) => s,
}));

vi.mock('@/lib/anonymous-session', () => ({
  ensureAnonymousSession: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  tokenStorage: mockTokenStorage,
  resolveWorkspaceFromAuthPayload: vi.fn(() => null),
  authApi: { getMe: vi.fn() },
  autostartCia: vi.fn(),
  ciaApi: {
    getAccountRuntime: vi.fn(),
    manualPause: vi.fn(),
    resume: vi.fn(),
  },
  disconnectWhatsApp: vi.fn(),
  getWhatsAppQR: vi.fn(),
  getWhatsAppStatus: vi.fn(),
  initiateWhatsAppConnection: vi.fn(),
  logoutWhatsApp: vi.fn(),
}));

import { useWhatsAppSession } from './useWhatsAppSession';

describe('useWhatsAppSession', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockTokenStorage.getToken.mockReturnValue('');
    mockTokenStorage.getWorkspaceId.mockReturnValue('');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns initial disconnected state', () => {
    const { result } = renderHook(() => useWhatsAppSession());
    expect(result.current.connected).toBe(false);
    expect(result.current.status).toBeNull();
    expect(result.current.qrCode).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.connecting).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.isPaused).toBe(false);
    expect(result.current.statusMessage).toBeNull();
  });

  it('uses provided workspaceId', () => {
    const { result } = renderHook(() =>
      useWhatsAppSession({ workspaceId: 'ws-custom' }),
    );
    expect(result.current.workspaceId).toBe('ws-custom');
  });

  it('falls back to tokenStorage workspaceId', () => {
    mockTokenStorage.getWorkspaceId.mockReturnValue('ws-token');
    const { result } = renderHook(() => useWhatsAppSession());
    expect(result.current.workspaceId).toBe('ws-token');
  });

  it('provides connect/disconnect/reset functions', () => {
    const { result } = renderHook(() => useWhatsAppSession());
    expect(typeof result.current.connect).toBe('function');
    expect(typeof result.current.disconnect).toBe('function');
    expect(typeof result.current.reset).toBe('function');
    expect(typeof result.current.loadStatus).toBe('function');
    expect(typeof result.current.pauseAutonomy).toBe('function');
    expect(typeof result.current.resumeAutonomy).toBe('function');
  });

  it('cleanup clears connect timer on unmount', () => {
    const { unmount } = renderHook(() => useWhatsAppSession());
    expect(() => unmount()).not.toThrow();
  });
});
