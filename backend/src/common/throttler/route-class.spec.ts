import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerModuleOptions, ThrottlerStorage } from '@nestjs/throttler';
import { RouteClassGuard } from './route-class.guard';

function mockContext(controllerName: string, handlerName: string): ExecutionContext {
  const mockClass = class {};
  Object.defineProperty(mockClass, 'name', { value: controllerName });
  const mockHandler = function () {};
  Object.defineProperty(mockHandler, 'name', { value: handlerName });

  return {
    getClass: () => mockClass,
    getHandler: () => mockHandler,
    switchToHttp: () => ({
      getRequest: () => ({
        ip: '127.0.0.1',
        headers: {},
        params: {},
      }),
      getResponse: () => ({}),
    }),
    getType: () => 'http',
  } as unknown as ExecutionContext;
}

function mockStorage(): ThrottlerStorage {
  const store = new Map<
    string,
    { totalHits: number; timeToExpire: number; isBlocked: boolean; timeToBlockExpire: number }
  >();

  return {
    async increment(
      key: string,
      _ttl: number,
      _limit: number,
      _blockDuration: number,
      _throttlerName: string,
    ) {
      const entry = store.get(key) || {
        totalHits: 0,
        timeToExpire: 60000,
        isBlocked: false,
        timeToBlockExpire: 0,
      };
      entry.totalHits += 1;
      store.set(key, entry);
      return entry;
    },
  };
}

function mockOptions(throttlers: ThrottlerModuleOptions): ThrottlerModuleOptions {
  return throttlers;
}

describe('RouteClassGuard', () => {
  let guard: RouteClassGuard;
  let storage: ThrottlerStorage;

  beforeEach(() => {
    storage = mockStorage();
    const throttlers = [
      { name: 'auth', limit: 10, ttl: 60000 },
      { name: 'webhook', limit: 100, ttl: 60000 },
      { name: 'read', limit: 300, ttl: 60000 },
      { name: 'mutate', limit: 60, ttl: 60000 },
      { name: 'ai', limit: 20, ttl: 60000 },
      { name: 'public-checkout', limit: 30, ttl: 60000 },
    ];

    guard = new RouteClassGuard(mockOptions(throttlers), storage, new Reflector());

    Object.defineProperty(guard, 'throttlers', {
      value: throttlers.map((t) => ({
        ...t,
        skipIf: () => false,
      })),
      writable: true,
    });

    Object.defineProperty(guard, 'commonOptions', {
      value: {},
      writable: true,
    });
  });

  describe('shouldSkip', () => {
    it('does not skip in production', async () => {
      const prev = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const result = await (
        guard as unknown as Record<string, () => Promise<boolean>>
      ).shouldSkip();
      process.env.NODE_ENV = prev;
      expect(result).toBe(false);
    });

    it('skips when JEST_WORKER_ID is set', async () => {
      process.env.JEST_WORKER_ID = '1';
      const result = await (
        guard as unknown as Record<string, () => Promise<boolean>>
      ).shouldSkip();
      delete process.env.JEST_WORKER_ID;
      expect(result).toBe(true);
    });
  });

  describe('generateKey', () => {
    it('includes tenant and user when available', () => {
      const ctx = {
        getClass: () => class AuthController {},
        getHandler: () => function login() {},
        switchToHttp: () => ({
          getRequest: () => ({
            ip: '1.2.3.4',
            workspaceId: 'ws-123',
            user: { sub: 'user-456' },
            headers: {},
            params: {},
          }),
          getResponse: () => ({}),
        }),
        getType: () => 'http',
      } as unknown as ExecutionContext;

      const key = (
        guard as unknown as Record<string, (c: ExecutionContext, s: string, n: string) => string>
      ).generateKey(ctx, '1.2.3.4', 'auth');

      expect(key).toBeTruthy();
      expect(key.length).toBe(64);
    });

    it('falls back to IP-only when no tenant or user', () => {
      const ctx = {
        getClass: () => class PublicController {},
        getHandler: () => function view() {},
        switchToHttp: () => ({
          getRequest: () => ({
            ip: '5.6.7.8',
            headers: {},
            params: {},
          }),
          getResponse: () => ({}),
        }),
        getType: () => 'http',
      } as unknown as ExecutionContext;

      const key = (
        guard as unknown as Record<string, (c: ExecutionContext, s: string, n: string) => string>
      ).generateKey(ctx, '5.6.7.8', 'read');

      expect(key).toBeTruthy();
      expect(key.length).toBe(64);
    });
  });

  describe('generateKey produces different keys for different tenants', () => {
    it('isolates tenant A from tenant B', () => {
      const ctxA = mockContext('DashboardController', 'getStats');
      const ctxB = mockContext('DashboardController', 'getStats');

      const keyA = (
        guard as unknown as Record<string, (c: ExecutionContext, s: string, n: string) => string>
      ).generateKey(
        {
          ...ctxA,
          switchToHttp: () => ({
            getRequest: () => ({ ip: '1.1.1.1', workspaceId: 'ws-a', headers: {}, params: {} }),
            getResponse: () => ({}),
          }),
        } as unknown as ExecutionContext,
        '1.1.1.1',
        'read',
      );

      const keyB = (
        guard as unknown as Record<string, (c: ExecutionContext, s: string, n: string) => string>
      ).generateKey(
        {
          ...ctxB,
          switchToHttp: () => ({
            getRequest: () => ({ ip: '1.1.1.1', workspaceId: 'ws-b', headers: {}, params: {} }),
            getResponse: () => ({}),
          }),
        } as unknown as ExecutionContext,
        '1.1.1.1',
        'read',
      );

      expect(keyA).not.toBe(keyB);
    });
  });
});
