import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { WorkspaceGuard } from './workspace.guard';
describe('WorkspaceGuard', () => {
  let guard: WorkspaceGuard;

  beforeEach(() => {
    guard = new WorkspaceGuard();
  });

  function createContext(request: any): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as any;
  }

  it('permite quando não há workspaceId no token', () => {
    const req: any = { user: { id: 'u1' }, headers: {}, params: {}, body: {} };
    const result = guard.canActivate(createContext(req));
    expect(result).toBe(true);
    expect(req.workspaceId).toBeUndefined();
  });

  it('propaga workspaceId do token para req e body quando ausente', () => {
    const req: any = {
      user: { id: 'u1', workspaceId: 'ws-1' },
      headers: {},
      params: {},
      query: {},
      body: {},
    };

    const result = guard.canActivate(createContext(req));
    expect(result).toBe(true);
    expect(req.workspaceId).toBe('ws-1');
    expect(req.body.workspaceId).toBe('ws-1');
  });

  it('não sobrescreve body.workspaceId quando já existe e é igual', () => {
    const req: any = {
      user: { id: 'u1', workspaceId: 'ws-1' },
      headers: {},
      params: {},
      query: {},
      body: { workspaceId: 'ws-1' },
    };

    const result = guard.canActivate(createContext(req));
    expect(result).toBe(true);
    expect(req.workspaceId).toBe('ws-1');
    expect(req.body.workspaceId).toBe('ws-1');
  });

  it('aceita workspaceId explícito se for redundante (igual ao do token)', () => {
    const req: any = {
      user: { id: 'u1', workspaceId: 'ws-1' },
      headers: { 'x-workspace-id': 'ws-1' },
      params: { workspaceId: 'ws-1' },
      query: { workspaceId: 'ws-1' },
      body: { workspaceId: 'ws-1' },
    };

    const result = guard.canActivate(createContext(req));
    expect(result).toBe(true);
    expect(req.workspaceId).toBe('ws-1');
  });

  it('bloqueia quando workspaceId explícito diverge do token', () => {
    const req: any = {
      user: { id: 'u1', workspaceId: 'ws-1' },
      headers: { 'x-workspace-id': 'ws-2' },
      params: {},
      query: {},
      body: {},
    };

    expect(() => guard.canActivate(createContext(req))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(createContext(req))).toThrow('workspace_mismatch');
  });
});
