import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockedEnsureAnonymousSession,
  mockedGetWhatsAppQR,
  mockedGetWhatsAppStatus,
  mockedInitiateWhatsAppConnection,
  mockedDisconnectWhatsApp,
  mockedLogoutWhatsApp,
  mockedAutostartCia,
  mockedGetSurface,
} = vi.hoisted(() => ({
  mockedEnsureAnonymousSession: vi.fn(),
  mockedGetWhatsAppQR: vi.fn(),
  mockedGetWhatsAppStatus: vi.fn(),
  mockedInitiateWhatsAppConnection: vi.fn(),
  mockedDisconnectWhatsApp: vi.fn(),
  mockedLogoutWhatsApp: vi.fn(),
  mockedAutostartCia: vi.fn(),
  mockedGetSurface: vi.fn(),
}));

vi.mock('@/lib/anonymous-session', () => ({
  ensureAnonymousSession: mockedEnsureAnonymousSession,
}));

vi.mock('@/lib/api', () => ({
  authApi: {
    getMe: vi.fn(),
  },
  autostartCia: mockedAutostartCia,
  ciaApi: {
    getSurface: mockedGetSurface,
  },
  disconnectWhatsApp: mockedDisconnectWhatsApp,
  getWhatsAppQR: mockedGetWhatsAppQR,
  getWhatsAppStatus: mockedGetWhatsAppStatus,
  initiateWhatsAppConnection: mockedInitiateWhatsAppConnection,
  logoutWhatsApp: mockedLogoutWhatsApp,
  resolveWorkspaceFromAuthPayload: vi.fn(() => ({ id: 'ws-1' })),
  tokenStorage: {
    getToken: vi.fn(() => 'token-123'),
    getWorkspaceId: vi.fn(() => 'ws-1'),
    setWorkspaceId: vi.fn(),
    clear: vi.fn(),
  },
  whatsappApi: {
    startBacklog: vi.fn(),
  },
}));

import { useWhatsAppSession } from './useWhatsAppSession';

describe('useWhatsAppSession', () => {
  const originalLocation = window.location;
  const assignSpy = vi.fn();

  beforeEach(() => {
    mockedEnsureAnonymousSession.mockReset();
    mockedGetWhatsAppQR.mockReset();
    mockedGetWhatsAppStatus.mockReset();
    mockedInitiateWhatsAppConnection.mockReset();
    mockedDisconnectWhatsApp.mockReset();
    mockedLogoutWhatsApp.mockReset();
    mockedAutostartCia.mockReset();
    mockedGetSurface.mockReset();
    assignSpy.mockReset();

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        origin: 'http://localhost:3000',
        href: 'http://localhost:3000/whatsapp',
        assign: assignSpy,
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('redirects to the official Meta flow when the workspace already has an authUrl', async () => {
    mockedGetWhatsAppStatus.mockResolvedValue({
      connected: false,
      status: 'connection_incomplete',
      authUrl: 'https://meta.example.com/connect',
    });

    const { result } = renderHook(() => useWhatsAppSession({ enabled: true }));

    await waitFor(() => {
      expect(result.current.statusMessage).toContain('Meta');
    });

    await act(async () => {
      await result.current.connect();
    });

    expect(assignSpy).toHaveBeenCalledWith('https://meta.example.com/connect');
    expect(mockedInitiateWhatsAppConnection).not.toHaveBeenCalled();
  });

  it('redirects to the official Meta flow when connect returns connect_required', async () => {
    mockedGetWhatsAppStatus.mockResolvedValue({
      connected: false,
      status: 'disconnected',
      authUrl: '',
    });
    mockedInitiateWhatsAppConnection.mockResolvedValue({
      status: 'connect_required',
      authUrl: 'https://meta.example.com/runtime-connect',
      message: 'Abrindo Meta...',
    });

    const { result } = renderHook(() => useWhatsAppSession({ enabled: true }));

    await act(async () => {
      await result.current.connect();
    });

    expect(mockedInitiateWhatsAppConnection).toHaveBeenCalledWith('ws-1');
    expect(assignSpy).toHaveBeenCalledWith('https://meta.example.com/runtime-connect');
  });

  it('does not poll the deprecated QR endpoint while Meta connection remains pending', async () => {
    vi.useFakeTimers();

    mockedGetWhatsAppStatus.mockResolvedValue({
      connected: false,
      status: 'connecting',
      authUrl: '',
      message: 'Abra o fluxo oficial da Meta.',
    });

    renderHook(() => useWhatsAppSession({ enabled: true }));

    await act(async () => {
      await Promise.resolve();
    });
    expect(mockedGetWhatsAppStatus).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3200);
    });

    expect(mockedGetWhatsAppQR).not.toHaveBeenCalled();
    expect(mockedGetWhatsAppStatus).toHaveBeenCalledTimes(2);
  });

  it('does not surface legacy qr snapshots from the status payload anymore', async () => {
    mockedGetWhatsAppStatus.mockResolvedValue({
      connected: false,
      status: 'SCAN_QR_CODE',
      provider: 'whatsapp-api',
      activeProvider: 'waha',
      authUrl: '',
      qrCode: 'data:image/png;base64,legacy',
      qrAvailable: true,
      browserSessionStatus: 'OPENING',
      screencastStatus: 'READY',
      viewerAvailable: true,
      message: 'Abra o fluxo oficial da Meta.',
    });

    const { result } = renderHook(() => useWhatsAppSession({ enabled: true }));

    await waitFor(() => {
      expect(result.current.status?.status).toBe('connecting');
    });

    expect(result.current.qrCode).toBeNull();
    expect(result.current.status?.provider).toBe('legacy-runtime');
    expect(result.current.status?.activeProvider).toBe('legacy-runtime');
    expect(result.current.status?.status).toBe('connecting');
    expect(result.current.status?.qrAvailable).toBe(false);
    expect(result.current.status?.browserSessionStatus).toBeUndefined();
    expect(result.current.status?.screencastStatus).toBeUndefined();
    expect(result.current.status?.viewerAvailable).toBe(false);
  });
});
