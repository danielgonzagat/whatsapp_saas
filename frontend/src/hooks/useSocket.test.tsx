import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  io: vi.fn(),
  socket: {
    disconnect: vi.fn(),
    emit: vi.fn(),
    off: vi.fn(),
    on: vi.fn(),
  },
  tokenStorage: {
    getToken: vi.fn(() => 'token-1'),
    getWorkspaceId: vi.fn(() => 'workspace-1'),
  },
}));

vi.mock('socket.io-client', () => ({
  io: mocks.io,
}));

vi.mock('@/lib/api/core', () => ({
  tokenStorage: mocks.tokenStorage,
}));

vi.mock('@/lib/http', () => ({
  API_BASE: 'http://localhost:3001',
}));

import { useSocket } from './useSocket';

describe('useSocket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.io.mockReturnValue(mocks.socket);
    mocks.tokenStorage.getToken.mockReturnValue('token-1');
    mocks.tokenStorage.getWorkspaceId.mockReturnValue('workspace-1');
  });

  it('starts with polling before the websocket upgrade to avoid noisy failed websocket probes', () => {
    renderHook(() => useSocket());

    expect(mocks.io).toHaveBeenCalledWith(
      'http://localhost:3001',
      expect.objectContaining({
        transports: ['polling', 'websocket'],
      }),
    );
  });

  it('does not open a socket when realtime is disabled for an inactive surface', () => {
    renderHook(() => useSocket({ enabled: false }));

    expect(mocks.io).not.toHaveBeenCalled();
  });
});
