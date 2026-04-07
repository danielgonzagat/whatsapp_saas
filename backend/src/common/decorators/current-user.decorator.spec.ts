import { ExecutionContext } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { CurrentUser } from './current-user.decorator';

function getParamDecoratorFactory() {
  class TestController {
    handler(@CurrentUser() _user: unknown) {}
  }
  const metadata = Reflect.getMetadata(ROUTE_ARGS_METADATA, TestController, 'handler');
  const key = Object.keys(metadata)[0];
  return metadata[key].factory;
}

function buildMockContext(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('CurrentUser decorator', () => {
  const factory = getParamDecoratorFactory();

  it('returns the full user payload when no data key is provided', () => {
    const user = { sub: 'u1', email: 'a@b.com', workspaceId: 'ws1', role: 'ADMIN' };
    const result = factory(undefined, buildMockContext(user));
    expect(result).toEqual(user);
  });

  it('returns a specific field when data key is provided', () => {
    const user = { sub: 'u1', email: 'a@b.com', workspaceId: 'ws1', role: 'ADMIN' };
    const result = factory('workspaceId', buildMockContext(user));
    expect(result).toBe('ws1');
  });

  it('returns undefined when user is null (AUTH_OPTIONAL dev mode)', () => {
    const result = factory(undefined, buildMockContext(null));
    expect(result).toBeUndefined();
  });

  it('returns undefined for a field when user is null', () => {
    const result = factory('sub', buildMockContext(null));
    expect(result).toBeUndefined();
  });

  it('returns undefined for an optional field not present', () => {
    const user = { sub: 'u1', email: 'a@b.com', workspaceId: 'ws1', role: 'ADMIN' };
    const result = factory('name', buildMockContext(user));
    expect(result).toBeUndefined();
  });
});
