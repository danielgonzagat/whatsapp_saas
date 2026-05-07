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
    throw new Error('Failed to register device');
  }
  return res.data as { deviceId: string };
}
