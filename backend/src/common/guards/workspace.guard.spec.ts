import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { WorkspaceGuard } from './workspace.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { Reflector } from '@nestjs/core';

describe('WorkspaceGuard (Multi-tenant Security)', () => {
  let guard: WorkspaceGuard;
  let prisma: jest.Mocked<PrismaService>;

  const mockPrisma = {
    workspaceMember: {
      findFirst: jest.fn(),
    },
  };

  const mockReflector = {
    getAllAndOverride: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkspaceGuard,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: Reflector, useValue: mockReflector },
      ],
    }).compile();

    guard = module.get<WorkspaceGuard>(WorkspaceGuard);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function createMockContext(options: {
    userId?: string;
    workspaceIdHeader?: string;
    workspaceIdParam?: string;
    workspaceIdBody?: string;
  }): ExecutionContext {
    const request = {
      user: options.userId ? { id: options.userId, sub: options.userId } : undefined,
      headers: options.workspaceIdHeader ? { 'x-workspace-id': options.workspaceIdHeader } : {},
      params: options.workspaceIdParam ? { workspaceId: options.workspaceIdParam } : {},
      body: options.workspaceIdBody ? { workspaceId: options.workspaceIdBody } : {},
    };

    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as ExecutionContext;
  }

  describe('canActivate', () => {
    it('should deny access when no user is present', async () => {
      const context = createMockContext({});

      const result = await guard.canActivate(context);
      expect(result).toBe(false);
    });

    it('should deny access when no workspace is specified', async () => {
      const context = createMockContext({
        userId: 'user-1',
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(false);
    });

    it('should deny access when user is not a member of workspace', async () => {
      mockPrisma.workspaceMember.findFirst.mockResolvedValue(null);

      const context = createMockContext({
        userId: 'user-1',
        workspaceIdHeader: 'ws-1',
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(false);
    });

    it('should allow access when user is a member of workspace', async () => {
      mockPrisma.workspaceMember.findFirst.mockResolvedValue({
        id: 'member-1',
        userId: 'user-1',
        workspaceId: 'ws-1',
        role: 'member',
      });

      const context = createMockContext({
        userId: 'user-1',
        workspaceIdHeader: 'ws-1',
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should get workspaceId from params if not in header', async () => {
      mockPrisma.workspaceMember.findFirst.mockResolvedValue({
        id: 'member-1',
        userId: 'user-1',
        workspaceId: 'ws-1',
        role: 'owner',
      });

      const context = createMockContext({
        userId: 'user-1',
        workspaceIdParam: 'ws-1',
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should get workspaceId from body if not in header or params', async () => {
      mockPrisma.workspaceMember.findFirst.mockResolvedValue({
        id: 'member-1',
        userId: 'user-1',
        workspaceId: 'ws-1',
        role: 'admin',
      });

      const context = createMockContext({
        userId: 'user-1',
        workspaceIdBody: 'ws-1',
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should prevent access to other workspace data', async () => {
      // User is member of ws-1, but trying to access ws-2
      mockPrisma.workspaceMember.findFirst.mockResolvedValue(null);

      const context = createMockContext({
        userId: 'user-1',
        workspaceIdHeader: 'ws-2', // Different workspace
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(false);
      expect(mockPrisma.workspaceMember.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'user-1',
            workspaceId: 'ws-2',
          },
        }),
      );
    });
  });

  describe('Role-based access', () => {
    it('should set user role on request object', async () => {
      mockPrisma.workspaceMember.findFirst.mockResolvedValue({
        id: 'member-1',
        userId: 'user-1',
        workspaceId: 'ws-1',
        role: 'admin',
      });

      const mockRequest: any = {
        user: { id: 'user-1' },
        headers: { 'x-workspace-id': 'ws-1' },
        params: {},
        body: {},
      };

      const context = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as ExecutionContext;

      await guard.canActivate(context);

      expect(mockRequest.workspaceRole).toBe('admin');
      expect(mockRequest.workspaceId).toBe('ws-1');
    });
  });

  describe('Security edge cases', () => {
    it('should reject invalid workspaceId format', async () => {
      const context = createMockContext({
        userId: 'user-1',
        workspaceIdHeader: '../../../etc/passwd', // Path traversal attempt
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(false);
    });

    it('should reject SQL injection attempts', async () => {
      mockPrisma.workspaceMember.findFirst.mockResolvedValue(null);

      const context = createMockContext({
        userId: 'user-1',
        workspaceIdHeader: "1' OR '1'='1", // SQL injection attempt
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(false);
    });

    it('should reject empty string workspaceId', async () => {
      const context = createMockContext({
        userId: 'user-1',
        workspaceIdHeader: '',
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(false);
    });

    it('should handle concurrent access to different workspaces', async () => {
      // Simulate two requests in parallel
      mockPrisma.workspaceMember.findFirst
        .mockResolvedValueOnce({ userId: 'user-1', workspaceId: 'ws-1', role: 'member' })
        .mockResolvedValueOnce(null); // User not member of ws-2

      const context1 = createMockContext({
        userId: 'user-1',
        workspaceIdHeader: 'ws-1',
      });

      const context2 = createMockContext({
        userId: 'user-1',
        workspaceIdHeader: 'ws-2',
      });

      const [result1, result2] = await Promise.all([
        guard.canActivate(context1),
        guard.canActivate(context2),
      ]);

      expect(result1).toBe(true);
      expect(result2).toBe(false);
    });
  });

  describe('Suspended workspace handling', () => {
    it('should attach suspendedAt to request if workspace is suspended', async () => {
      mockPrisma.workspaceMember.findFirst.mockResolvedValue({
        id: 'member-1',
        userId: 'user-1',
        workspaceId: 'ws-1',
        role: 'owner',
        workspace: {
          id: 'ws-1',
          providerSettings: { billingSuspended: true },
        },
      });

      const mockRequest: any = {
        user: { id: 'user-1' },
        headers: { 'x-workspace-id': 'ws-1' },
        params: {},
        body: {},
      };

      const context = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as ExecutionContext;

      await guard.canActivate(context);

      expect(mockRequest.workspaceSuspended).toBe(true);
    });
  });
});
