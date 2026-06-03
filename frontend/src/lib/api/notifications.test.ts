import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./core', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from './core';
import { registerNotificationDevice } from './notifications';

const apiFetchMock = vi.mocked(apiFetch);

describe('notifications API', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it('surfaces device registration backend errors', async () => {
    apiFetchMock.mockResolvedValue({ error: 'Token rejected', status: 400 });

    await expect(registerNotificationDevice('push-token', 'web')).rejects.toThrow('Token rejected');
  });

  it('rejects missing device payloads instead of returning undefined as registered', async () => {
    apiFetchMock.mockResolvedValue({ data: undefined, status: 200 });

    await expect(registerNotificationDevice('push-token', 'web')).rejects.toThrow(
      'Notification device was not registered.',
    );
  });

  it('returns confirmed device registration payloads', async () => {
    apiFetchMock.mockResolvedValue({ data: { deviceId: 'device-1' }, status: 201 });

    await expect(registerNotificationDevice('push-token', 'web')).resolves.toEqual({ deviceId: 'device-1' });
  });
});
