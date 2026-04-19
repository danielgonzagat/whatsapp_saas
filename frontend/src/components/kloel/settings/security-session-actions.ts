'use client';

import { authApi } from '@/lib/api';
import { buildMarketingUrl } from '@/lib/subdomains';

export async function signOutCurrentKloelSession(host?: string) {
  await authApi.signOut();

  if (typeof window !== 'undefined') {
    const resolvedHost = host || window.location.host;
    window.location.assign(buildMarketingUrl('/login', resolvedHost));
  }
}
