import * as Sentry from '@sentry/nestjs';

export interface KloelSentryContext {
  workspaceId?: string;
  userId?: string;
  runtime: string;
  [key: string]: unknown;
}

let runtimeContext: KloelSentryContext = { runtime: 'backend' };

export function initSentryContext(runtime = 'backend'): void {
  runtimeContext = { runtime };
  Sentry.setContext('kloel', runtimeContext);
}

export function setSentryWorkspaceContext(workspaceId: string, userId?: string): void {
  runtimeContext = { ...runtimeContext, workspaceId, userId };
  Sentry.setContext('kloel', runtimeContext);
  if (workspaceId) Sentry.setTag('workspaceId', workspaceId);
  if (userId) Sentry.setUser({ id: userId });
}

export function addSentryBreadcrumb(
  message: string,
  category = 'kloel',
  data?: Record<string, unknown>,
): void {
  Sentry.addBreadcrumb({ message, category, data, level: 'info' });
}

export function getSentryContext(): Readonly<KloelSentryContext> {
  return runtimeContext;
}
