import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PrismaService } from '../../prisma/prisma.service';
import { KloelSecurityGuard } from './kloel-security.guard';

describe('KloelSecurityGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let prisma: {
    workspace: { findUnique: jest.Mock };
    autopilotEvent: { count: jest.Mock };
  };
  let guard: KloelSecurityGuard;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    };
    prisma = {
      workspace: {
        findUnique: jest.fn(),
      },
      autopilotEvent: {
        count: jest.fn(),
      },
    };
    guard = new KloelSecurityGuard(
      reflector as unknown as Reflector,
      prisma as unknown as PrismaService,
    );
  });

  afterEach(() => {
    guard.onModuleDestroy();
  });

  it('ignores malformed aiRequestsPerDay limits instead of blocking agent processing', async () => {
    const request = {
      path: '/agent/process',
      params: { workspaceId: 'ws-1' },
      body: {},
      headers: {},
      ip: '127.0.0.1',
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => 'handler',
      getClass: () => 'class',
    } as unknown as ExecutionContext;

    prisma.workspace.findUnique.mockResolvedValue({
      id: 'ws-1',
      name: 'Workspace Teste',
      providerSettings: {
        planLimits: {
          aiRequestsPerDay: '0',
        },
      },
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(prisma.autopilotEvent.count).not.toHaveBeenCalled();
  });
});
