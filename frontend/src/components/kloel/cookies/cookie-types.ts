export type CookieConsentPreferences = {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  updatedAt?: string;
};

export type CookieConsentPayload = {
  necessary?: boolean;
  analytics?: boolean;
  marketing?: boolean;
};

export type CookieConsentResponse = {
  success?: boolean;
  consent: CookieConsentPreferences | null;
};
