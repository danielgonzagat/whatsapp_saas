import { adminFetch } from './admin-client';

/** Admin notifications response shape. */
export interface AdminNotificationsResponse {
  items: Array<{
    id: string;
    type: string;
    title: string;
    body: string;
    createdAt: string;
    read: boolean;
  }>;
  unreadCount: number;
  preferences: {
    chargebacks: boolean;
    kyc: boolean;
    support: boolean;
    security: boolean;
    growth: boolean;
  };
}

/** Admin notifications api. */
export const adminNotificationsApi = {
  list() {
    return adminFetch<AdminNotificationsResponse>('/notifications');
  },
  markRead(notificationId: string) {
    return adminFetch<{ ok: true }>(`/notifications/${encodeURIComponent(notificationId)}/read`, {
      method: 'POST',
    });
  },
  updatePreferences(preferences: Partial<AdminNotificationsResponse['preferences']>) {
    return adminFetch<{ ok: true }>('/notifications/preferences', {
      method: 'PATCH',
      body: preferences,
    });
  },
};
