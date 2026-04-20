'use client';

import { CookiePolicyPage } from '@/components/kloel/cookies/CookiePolicyPage';
import { openCookiePreferences } from '@/components/kloel/cookies/CookieProvider';

/** Cookies page. */
export default function CookiesPage() {
  return <CookiePolicyPage onOpenPreferences={openCookiePreferences} />;
}
