import { apiFetch } from './core';

export type OnboardingProfilePayload = {
  userType: string;
  productType: string;
  primaryChannel: string;
  hasProduct: boolean;
  hasCheckout: boolean;
  aiUseCase: string;
};

export type OnboardingChecklistItem = {
  key: string;
  completed: boolean;
};

export async function saveOnboardingProfile(
  workspaceId: string,
  payload: OnboardingProfilePayload,
) {
  return apiFetch<{
    completed: boolean;
    profile: OnboardingProfilePayload & { savedAt: string };
    checklist: OnboardingChecklistItem[];
    nextMissingStep: string | null;
  }>(`/kloel/onboarding/${encodeURIComponent(workspaceId)}/profile`, {
    method: 'POST',
    body: payload,
  });
}

export async function completeOnboardingProfile(workspaceId: string) {
  return apiFetch<{ completed: boolean; completedAt: string }>(
    `/kloel/onboarding/${encodeURIComponent(workspaceId)}/complete`,
    {
      method: 'POST',
    },
  );
}

export async function getOnboardingStatus(workspaceId: string) {
  return apiFetch<{
    completed: boolean;
    messagesCount?: number;
    hasStarted?: boolean;
    step?: string;
    data?: Record<string, unknown>;
  }>(`/kloel/onboarding/${encodeURIComponent(workspaceId)}/status`);
}

export const onboardingApi = {
  saveOnboardingProfile,
  completeOnboardingProfile,
  getOnboardingStatus,
};
