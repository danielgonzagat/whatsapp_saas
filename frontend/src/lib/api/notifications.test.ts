import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./core', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from './core';
import {
  getNotificationPreferences,
  registerNotificationDevice,
  updateNotificationPreferences,
} from './notifications';

const apiFetchMock = vi.mocked(apiFetch);

describe('notifications API', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  describe('notification preferences', () => {
    it('returns the loaded preferences from GET /notifications/preferences', async () => {
      apiFetchMock.mockResolvedValue({ data: { emailTips: false }, status: 200 });

      await expect(getNotificationPreferences()).resolves.toEqual({ emailTips: false });
      expect(apiFetchMock).toHaveBeenCalledWith('/notifications/preferences');
    });

    it('rejects malformed preference payloads instead of fabricating defaults', async () => {
      apiFetchMock.mockResolvedValue({ data: { emailTips: 'yes' }, status: 200 });

      await expect(getNotificationPreferences()).rejects.toThrow(
        'Resposta de preferências de notificação inválida.',
      );
    });

    it('persists a partial update via PUT and returns the confirmed state', async () => {
      apiFetchMock.mockResolvedValue({ data: { emailTips: false }, status: 200 });

      await expect(updateNotificationPreferences({ emailTips: false })).resolves.toEqual({
        emailTips: false,
      });
      expect(apiFetchMock).toHaveBeenCalledWith('/notifications/preferences', {
        method: 'PUT',
        body: { emailTips: false },
      });
    });

    it('surfaces backend errors on save instead of pretending success', async () => {
      apiFetchMock.mockResolvedValue({ error: 'boom', status: 400 });

      await expect(updateNotificationPreferences({ emailTips: true })).rejects.toThrow('boom');
    });
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
