import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ADMIN_GLOBAL_OPERATION_KEY,
  AdminGlobalOperation,
  AdminGlobalOperationGuard,
} from '../admin-global-operation.decorator';

type MockUser = {
  sub: string;
  email: string;
  workspaceId: string;
  role: string;
};

function buildMockContext(user: MockUser | null) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
    getHandler: () => ({}),
    getClass: () => class {},
  } as never;
}

function buildDecoratedContext(user: MockUser | null, reason: string) {
  const handler = () => undefined;
  const cls = class {};

  Reflect.defineMetadata(ADMIN_GLOBAL_OPERATION_KEY, reason, handler);
  Reflect.defineMetadata(ADMIN_GLOBAL_OPERATION_KEY, reason, cls);

  const reflector = new Reflector();

  return {
    guard: new AdminGlobalOperationGuard(reflector),
    context: {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
      getHandler: () => handler,
      getClass: () => cls,
    } as never,
  };
}

describe('AdminGlobalOperation decorator', () => {
  describe('metadata', () => {
    it('sets the correct metadata key with the reason string', () => {
      class TestController {
        @AdminGlobalOperation('cross-workspace audit')
        handler(this: void): void {}
      }

      expect(
        Reflect.getMetadata(ADMIN_GLOBAL_OPERATION_KEY, TestController.prototype.handler),
      ).toBe('cross-workspace audit');
    });

    it('sets the metadata on a class when applied at the class level', () => {
      @AdminGlobalOperation('class-level-reason')
      class TestClass {
        handler(this: void): void {}
      }

      expect(Reflect.getMetadata(ADMIN_GLOBAL_OPERATION_KEY, TestClass)).toBe('class-level-reason');
    });
  });

  describe('AdminGlobalOperationGuard', () => {
    it('returns true when the handler is not decorated', () => {
      const guard = new AdminGlobalOperationGuard(new Reflector());
      const result = guard.canActivate(buildMockContext(null));
      expect(result).toBe(true);
    });

    it('allows ADMIN users', () => {
      const { guard, context } = buildDecoratedContext(
        { sub: 'u1', email: 'a@b.com', workspaceId: 'ws1', role: 'ADMIN' },
        'credential rotation',
      );

      const result: boolean = guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('rejects non-ADMIN users with ForbiddenException', () => {
      const { guard, context } = buildDecoratedContext(
        { sub: 'u2', email: 'b@b.com', workspaceId: 'ws1', role: 'MEMBER' },
        'credential rotation',
      );

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('rejects missing user with ForbiddenException', () => {
      const { guard, context } = buildDecoratedContext(null, 'credential rotation');

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('rejects undefined user.role with ForbiddenException', () => {
      const { guard, context } = buildDecoratedContext(
        { sub: 'u3', email: 'c@b.com', workspaceId: 'ws1', role: '' },
        'credential rotation',
      );

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });
});
