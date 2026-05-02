import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';

function mockExecutionContext(headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
    getClass: () => ({}),
    getHandler: () => ({}),
    getArgByIndex: () => ({}),
    getArgs: () => [],
    getType: () => 'http',
    switchToRpc: () => ({}),
    switchToWs: () => ({}),
  } as unknown as ExecutionContext;
}

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;
  let mockApiKeysService: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockApiKeysService = {
      validateKey: jest.fn(),
    };

    guard = new ApiKeyGuard(mockApiKeysService);
  });

  describe('canActivate', () => {
    it('lança UnauthorizedException quando header x-api-key está ausente', async () => {
      const ctx = mockExecutionContext({});

      await expect(guard.canActivate(ctx)).rejects.toThrow(
        new UnauthorizedException('API Key missing'),
      );
      expect(mockApiKeysService.validateKey).not.toHaveBeenCalled();
    });

    it('lança UnauthorizedException quando key é inválida', async () => {
      mockApiKeysService.validateKey.mockResolvedValue(null);

      const ctx = mockExecutionContext({ 'x-api-key': 'sk_live_invalid' });

      await expect(guard.canActivate(ctx)).rejects.toThrow(
        new UnauthorizedException('Invalid API Key'),
      );
      expect(mockApiKeysService.validateKey).toHaveBeenCalledWith('sk_live_invalid');
    });

    it('injeta workspaceId no request quando key é válida', async () => {
      mockApiKeysService.validateKey.mockResolvedValue({
        id: 'ak-1',
        workspaceId: 'ws-123',
      });

      const request: any = { headers: { 'x-api-key': 'sk_live_valid' } };
      const ctx: any = {
        switchToHttp: () => ({ getRequest: () => request }),
        getClass: () => ({}),
        getHandler: () => ({}),
        getArgByIndex: () => ({}),
        getArgs: () => [],
        getType: () => 'http',
        switchToRpc: () => ({}),
        switchToWs: () => ({}),
      };

      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
      expect(request.user).toEqual({ workspaceId: 'ws-123' });
      expect(mockApiKeysService.validateKey).toHaveBeenCalledWith('sk_live_valid');
    });

    it('faz chamada a validateKey uma única vez por request', async () => {
      mockApiKeysService.validateKey.mockResolvedValue({
        id: 'ak-1',
        workspaceId: 'ws-1',
      });

      const ctx = mockExecutionContext({ 'x-api-key': 'sk_live_key' });

      await guard.canActivate(ctx);

      expect(mockApiKeysService.validateKey).toHaveBeenCalledTimes(1);
    });
  });
});
