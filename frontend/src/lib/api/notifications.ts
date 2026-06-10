import { apiFetch } from './core';

/** Toggleable e-mail notification categories for the logged-in user. */
export interface EmailNotificationPreferences {
  /** Onboarding/tips sequence (day 1/3/7) + product tips e-mails. */
  emailTips: boolean;
}

function assertPreferencesPayload(
  data: unknown,
  fallbackError: string,
): EmailNotificationPreferences {
  const record = (data ?? {}) as Record<string, unknown>;
  if (typeof record.emailTips !== 'boolean') {
    throw new Error(fallbackError);
  }
  return { emailTips: record.emailTips };
}

/** GET /notifications/preferences — current user's e-mail notification preferences. */
export async function getNotificationPreferences(): Promise<EmailNotificationPreferences> {
  const res = await apiFetch<EmailNotificationPreferences>(`/notifications/preferences`);
  if (res.error) {
    throw new Error(res.error);
  }
  if (res.status >= 400) {
    throw new Error('Não foi possível carregar as preferências de notificação.');
  }
  return assertPreferencesPayload(
    res.data,
    'Resposta de preferências de notificação inválida.',
  );
}

/** PUT /notifications/preferences — persist a partial preferences update. */
export async function updateNotificationPreferences(
  partial: Partial<EmailNotificationPreferences>,
): Promise<EmailNotificationPreferences> {
  const res = await apiFetch<EmailNotificationPreferences>(`/notifications/preferences`, {
    method: 'PUT',
    body: partial,
  });
  if (res.error) {
    throw new Error(res.error);
  }
  if (res.status >= 400) {
    throw new Error('Não foi possível salvar as preferências de notificação.');
  }
  return assertPreferencesPayload(
    res.data,
    'O servidor não confirmou as preferências salvas.',
  );
}

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
