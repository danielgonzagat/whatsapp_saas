'use client';

import { DatadogAppRouter } from '@datadog/browser-rum-nextjs';

const datadogRumEnabled =
  process.env.NEXT_PUBLIC_DD_RUM_ENABLED !== 'false' &&
  !!process.env.NEXT_PUBLIC_DD_CLIENT_TOKEN &&
  !!process.env.NEXT_PUBLIC_DD_APPLICATION_ID;

/** Datadog app router hook-up for Next.js App Router. */
export function DatadogRumRouter() {
  if (!datadogRumEnabled) {
    return null;
  }

  return <DatadogAppRouter />;
}
