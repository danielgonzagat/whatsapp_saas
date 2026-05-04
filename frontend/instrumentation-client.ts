/**
 * Next.js Client Instrumentation — runs BEFORE any page/component code.
 *
 * Polotno SDK accesses React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED
 * which was removed in React 19. This shim creates backward compatibility.
 */

import { datadogLogs } from '@datadog/browser-logs';
import { datadogRum, type PropagatorType } from '@datadog/browser-rum';
import {
  nextjsPlugin,
  onRouterTransitionStart as onDatadogRouterTransitionStart,
} from '@datadog/browser-rum-nextjs';
import React from 'react';

const sentryEnabled = process.env.KLOEL_ENABLE_SENTRY_BUILD === 'true';
const datadogBrowserGlobal = globalThis as typeof globalThis & {
  __kloelDatadogRumInitialized?: boolean;
  __kloelDatadogLogsInitialized?: boolean;
};
const datadogClientToken = process.env.NEXT_PUBLIC_DD_CLIENT_TOKEN?.trim() || '';
const datadogApplicationId = process.env.NEXT_PUBLIC_DD_APPLICATION_ID?.trim() || '';
const datadogSite = process.env.NEXT_PUBLIC_DD_SITE?.trim() || 'datadoghq.com';
const datadogService = process.env.NEXT_PUBLIC_DD_SERVICE?.trim() || 'kloel-frontend';
const datadogEnv = process.env.NEXT_PUBLIC_DD_ENV?.trim() || process.env.NODE_ENV || 'development';
const datadogVersion = process.env.NEXT_PUBLIC_DD_VERSION?.trim() || '1.0.0';
const datadogRumEnabled =
  process.env.NEXT_PUBLIC_DD_RUM_ENABLED !== 'false' &&
  datadogClientToken.length > 0 &&
  datadogApplicationId.length > 0;
const datadogLogsEnabled =
  process.env.NEXT_PUBLIC_DD_LOGS_ENABLED !== 'false' && datadogClientToken.length > 0;

let sentryModulePromise: Promise<typeof import('@sentry/nextjs')> | null = null;

function getSentryModule() {
  if (!sentryEnabled) return null;
  if (!sentryModulePromise) {
    sentryModulePromise = import('@sentry/nextjs');
  }
  return sentryModulePromise;
}

function parseSampleRate(rawValue: string | undefined, fallback: number): number {
  const trimmed = rawValue?.trim();
  if (!trimmed) {
    return fallback;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(100, Math.max(0, parsed));
}

function normalizeOrigin(rawValue: string | undefined): string | null {
  const trimmed = rawValue?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

type BrowserConsoleLogLevel = 'log' | 'debug' | 'info' | 'warn' | 'error';

function parseForwardConsoleLogs(rawValue: string | undefined): BrowserConsoleLogLevel[] | 'all' {
  const trimmed = rawValue?.trim().toLowerCase();
  if (!trimmed) {
    return ['error'];
  }
  if (trimmed === 'all') {
    return 'all';
  }

  const supportedLevels: BrowserConsoleLogLevel[] = ['log', 'debug', 'info', 'warn', 'error'];
  const selected = trimmed
    .split(',')
    .map((value) => value.trim())
    .filter((value): value is BrowserConsoleLogLevel =>
      supportedLevels.includes(value as BrowserConsoleLogLevel),
    );

  return selected.length > 0 ? selected : ['error'];
}

function buildAllowedTracingUrls() {
  const origins = new Set<string>();

  const envOrigins = [
    normalizeOrigin(process.env.NEXT_PUBLIC_API_URL),
    normalizeOrigin(process.env.NEXT_PUBLIC_SERVICE_BASE_URL),
  ];

  for (const origin of envOrigins) {
    if (origin) {
      origins.add(origin);
    }
  }

  if (
    origins.size === 0 &&
    typeof window !== 'undefined' &&
    ['localhost', '127.0.0.1'].includes(window.location.hostname)
  ) {
    origins.add('http://localhost:3001');
  }

  return Array.from(origins).map((origin) => ({
    match: origin,
    propagatorTypes: ['tracecontext', 'datadog'] as PropagatorType[],
  }));
}

if (datadogRumEnabled && !datadogBrowserGlobal.__kloelDatadogRumInitialized) {
  datadogRum.init({
    applicationId: datadogApplicationId,
    clientToken: datadogClientToken,
    site: datadogSite,
    service: datadogService,
    env: datadogEnv,
    version: datadogVersion,
    sessionSampleRate: parseSampleRate(process.env.NEXT_PUBLIC_DD_SESSION_SAMPLE_RATE, 100),
    sessionReplaySampleRate: parseSampleRate(
      process.env.NEXT_PUBLIC_DD_SESSION_REPLAY_SAMPLE_RATE,
      20,
    ),
    trackResources: true,
    trackLongTasks: true,
    trackUserInteractions: true,
    defaultPrivacyLevel: 'mask-user-input',
    allowedTracingUrls: buildAllowedTracingUrls(),
    plugins: [nextjsPlugin()],
  });
  datadogBrowserGlobal.__kloelDatadogRumInitialized = true;
}

if (datadogLogsEnabled && !datadogBrowserGlobal.__kloelDatadogLogsInitialized) {
  datadogLogs.init({
    clientToken: datadogClientToken,
    site: datadogSite,
    service: datadogService,
    env: datadogEnv,
    version: datadogVersion,
    forwardErrorsToLogs: true,
    forwardConsoleLogs: parseForwardConsoleLogs(process.env.NEXT_PUBLIC_DD_FORWARD_CONSOLE_LOGS),
    sessionSampleRate: parseSampleRate(process.env.NEXT_PUBLIC_DD_LOGS_SESSION_SAMPLE_RATE, 100),
  });
  datadogBrowserGlobal.__kloelDatadogLogsInitialized = true;
}

if (sentryEnabled) {
  void getSentryModule()?.then((Sentry) => {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0.01,
      replaysOnErrorSampleRate: 1.0,
      environment: process.env.NODE_ENV || 'development',
      enabled: process.env.NODE_ENV === 'production',
      integrations: [
        Sentry.replayIntegration({
          maskAllText: true,
          blockAllMedia: false,
        }),
      ],
    });
  });
}

export function onRouterTransitionStart(
  ...args: Parameters<typeof onDatadogRouterTransitionStart>
) {
  if (datadogRumEnabled) {
    onDatadogRouterTransitionStart(...args);
  }
  if (!sentryEnabled) return;
  void getSentryModule()?.then((Sentry) => {
    (Sentry.captureRouterTransitionStart as (...params: unknown[]) => unknown)(...args);
  });
}

const reactInternals = React as unknown as Record<string, unknown>;
const newInternals = reactInternals.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

if (newInternals && !reactInternals.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED) {
  Object.defineProperty(React, '__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED', {
    value: {
      ReactCurrentOwner: { current: null },
      ReactCurrentBatchConfig: { transition: null },
      ReactCurrentDispatcher: { current: null },
      ...(newInternals as Record<string, unknown>),
    },
    writable: true,
    configurable: true,
  });
}
