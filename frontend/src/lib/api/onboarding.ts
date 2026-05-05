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
