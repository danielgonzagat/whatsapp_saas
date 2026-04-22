import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { WorkspaceGuard } from './workspace.guard';

type WorkspaceRequest = {
  user?: { id: string; workspaceId?: string };
  headers: Record<string, string>;
  params: Record<string, string>;
  query: Record<string, string>;
  body: Record<string, unknown>;
  workspaceId?: string;
};

describe('WorkspaceGuard', () => {
  let guard: WorkspaceGuard;

  beforeEach(() => {
    guard = new WorkspaceGuard();
  });

  function createContext(request: WorkspaceRequest): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  }

  it('permite quando não há workspaceId no token', () => {
    const req: WorkspaceRequest = {
      user: { id: 'u1' },
      headers: {},
      params: {},
      query: {},
      body: {},
    };
    const result = guard.canActivate(createContext(req));
    expect(result).toBe(true);
    expect(req.workspaceId).toBeUndefined();
  });

  it('propaga workspaceId do token para req e body quando ausente', () => {
    const req: WorkspaceRequest = {
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
    const req: WorkspaceRequest = {
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
    const req: WorkspaceRequest = {
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
    const req: WorkspaceRequest = {
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
