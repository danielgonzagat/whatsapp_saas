'use client';

import { CookiePolicyPage } from '@/components/kloel/cookies/CookiePolicyPage';
import { openCookiePreferences } from '@/components/kloel/cookies/CookieProvider';

export default function CookiesPage() {
  return <CookiePolicyPage onOpenPreferences={openCookiePreferences} />;
}
