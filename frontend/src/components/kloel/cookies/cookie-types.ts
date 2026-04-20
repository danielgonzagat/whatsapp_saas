/** Cookie consent preferences type. */
export type CookieConsentPreferences = {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  updatedAt?: string;
};

/** Cookie consent payload type. */
export type CookieConsentPayload = {
  necessary?: boolean;
  analytics?: boolean;
  marketing?: boolean;
};

/** Cookie consent response type. */
export type CookieConsentResponse = {
  success?: boolean;
  consent: CookieConsentPreferences | null;
};
