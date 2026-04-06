/**
 * Next.js Client Instrumentation — runs BEFORE any page/component code.
 *
 * Polotno SDK accesses React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED
 * which was removed in React 19. This shim creates backward compatibility.
 */

import * as Sentry from '@sentry/nextjs';
import React from 'react';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.NODE_ENV,
  enabled: process.env.NODE_ENV === 'production',
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

const newInternals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

if (newInternals && !(React as any).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED) {
  Object.defineProperty(React, '__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED', {
    value: {
      ReactCurrentOwner: { current: null },
      ReactCurrentBatchConfig: { transition: null },
      ReactCurrentDispatcher: { current: null },
      ...newInternals,
    },
    writable: true,
    configurable: true,
  });
}
