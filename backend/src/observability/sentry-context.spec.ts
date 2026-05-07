jest.mock('@sentry/nestjs', () => ({
  setContext: jest.fn(),
  setTag: jest.fn(),
  setUser: jest.fn(),
  addBreadcrumb: jest.fn(),
}));

import * as Sentry from '@sentry/nestjs';
import {
  initSentryContext,
  setSentryWorkspaceContext,
  addSentryBreadcrumb,
  getSentryContext,
} from './sentry-context';

describe('sentry-context', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    initSentryContext('backend');
  });

  describe('initSentryContext', () => {
    it('sets the runtime field on the kloel context', () => {
      initSentryContext('worker');

      expect(Sentry.setContext).toHaveBeenCalledWith('kloel', {
        runtime: 'worker',
      });
    });

    it('defaults runtime to backend', () => {
      initSentryContext();

      expect(Sentry.setContext).toHaveBeenCalledWith('kloel', {
        runtime: 'backend',
      });
    });
  });

  describe('setSentryWorkspaceContext', () => {
    it('sets workspaceId and userId in context and tags', () => {
      setSentryWorkspaceContext('ws-1', 'user-42');

      expect(Sentry.setContext).toHaveBeenCalledWith('kloel', {
        runtime: 'backend',
        workspaceId: 'ws-1',
        userId: 'user-42',
      });
      expect(Sentry.setTag).toHaveBeenCalledWith('workspaceId', 'ws-1');
      expect(Sentry.setUser).toHaveBeenCalledWith({ id: 'user-42' });
    });

    it('does not set tag or user when values are falsy', () => {
      jest.clearAllMocks();

      setSentryWorkspaceContext('', '');
      setSentryWorkspaceContext('', undefined);

      expect(Sentry.setTag).not.toHaveBeenCalled();
      expect(Sentry.setUser).not.toHaveBeenCalled();
    });

    it('preserves runtime field when extending context', () => {
      initSentryContext('worker');
      jest.clearAllMocks();

      setSentryWorkspaceContext('ws-5', 'user-9');

      expect(Sentry.setContext).toHaveBeenCalledWith('kloel', {
        runtime: 'worker',
        workspaceId: 'ws-5',
        userId: 'user-9',
      });
    });
  });

  describe('addSentryBreadcrumb', () => {
    it('adds a breadcrumb with default category kloel', () => {
      addSentryBreadcrumb('user logged in');

      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
        message: 'user logged in',
        category: 'kloel',
        data: undefined,
        level: 'info',
      });
    });

    it('adds a breadcrumb with custom category and data', () => {
      addSentryBreadcrumb('payment processed', 'checkout', { amount: 100 });

      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
        message: 'payment processed',
        category: 'checkout',
        data: { amount: 100 },
        level: 'info',
      });
    });
  });

  describe('getSentryContext', () => {
    it('returns a readonly snapshot of the current context', () => {
      initSentryContext('backend');
      setSentryWorkspaceContext('ws-3', 'user-7');

      const ctx = getSentryContext();

      expect(ctx).toEqual({
        runtime: 'backend',
        workspaceId: 'ws-3',
        userId: 'user-7',
      });
    });

    it('returns default runtime only when nothing else is set', () => {
      initSentryContext();

      const ctx = getSentryContext();

      expect(ctx).toEqual({ runtime: 'backend' });
    });
  });
});
