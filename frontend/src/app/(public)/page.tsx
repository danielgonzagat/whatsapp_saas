import { headers } from 'next/headers';

import { FloatingChat } from '@/components/kloel/landing/FloatingChat';
import KloelLanding from '@/components/kloel/landing/KloelLanding';

function firstHeaderValue(value: string | null): string | null {
  return value?.split(',')[0]?.trim() || null;
}

/** Landing page. */
export default async function LandingPage() {
  const requestHeaders = await headers();
  const initialHost =
    firstHeaderValue(requestHeaders.get('x-forwarded-host')) ??
    firstHeaderValue(requestHeaders.get('host'));

  return (
    <>
      <KloelLanding initialHost={initialHost} />
      <FloatingChat />
    </>
  );
}
