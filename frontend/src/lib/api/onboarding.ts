import { apiFetch } from './core';

export const onboardingApi = {
  start: (workspaceId: string) =>
    apiFetch<{ message: string }>(`/kloel/onboarding/${encodeURIComponent(workspaceId)}/start`, {
      method: 'POST',
    }),

  chat: (workspaceId: string, message: string) =>
    apiFetch<{ message: string }>(`/kloel/onboarding/${encodeURIComponent(workspaceId)}/chat`, {
      method: 'POST',
      body: { message },
    }),

  status: (workspaceId: string) =>
    apiFetch<{
      completed: boolean;
      messagesCount: number;
      step?: string;
      data?: Record<string, unknown>;
    }>(`/kloel/onboarding/${encodeURIComponent(workspaceId)}/status`),
};
