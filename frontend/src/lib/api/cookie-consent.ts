import type {
  CookieConsentPayload,
  CookieConsentPreferences,
  CookieConsentResponse,
} from '@/components/kloel/cookies/cookie-types';
import { apiFetch } from './core';

/** Cookie consent api. */
export const cookieConsentApi = {
  get: () => apiFetch<CookieConsentResponse>('/v1/cookie-consent', { cache: 'no-store' }),
  save: (payload: CookieConsentPayload) =>
    apiFetch<CookieConsentResponse>('/v1/cookie-consent', {
      method: 'POST',
      body: payload,
    }),
};

export type { CookieConsentPreferences, CookieConsentPayload, CookieConsentResponse };
