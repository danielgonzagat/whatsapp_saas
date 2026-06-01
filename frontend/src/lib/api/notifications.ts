import { apiFetch } from './core';

export async function registerNotificationDevice(
  token: string,
  platform: string,
): Promise<{ deviceId: string }> {
  const res = await apiFetch<{ deviceId: string }>(`/notifications/register-device`, {
    method: 'POST',
    body: { token, platform },
  });
  if (res.error) {
    throw new Error(res.error);
  }
  if (res.status >= 400) {
    throw new Error('Failed to register device');
  }
  if (!res.data?.deviceId) {
    throw new Error('Notification device was not registered.');
  }
  return res.data;
}
