import { Test, TestingModule } from '@nestjs/testing';
import { AdminAuditService } from '../audit/admin-audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminChatSessionService, type ListSessionsInput } from './admin-chat-session.service';

const sessionShape = {
  id: 'session_1',
  adminUserId: 'admin_1',
  workspaceId: 'ws_1',
  title: 'Test Session',
  createdAt: new Date('2026-05-10T00:00:00Z'),
  updatedAt: new Date('2026-05-10T00:00:00Z'),
  lastUsedAt: new Date('2026-05-10T12:00:00Z'),
  expiresAt: new Date('2026-05-11T12:00:00Z'),
  deletedAt: null as Date | null,
  messages: [] as Array<Record<string, unknown>>,
};

describe('AdminChatSessionService', () => {
  let service: AdminChatSessionService;

  const workspaceId = 'ws_1';
  const otherWorkspaceId = 'ws_2';
  const adminUserId = 'admin_1';

  const mockCreate = jest.fn();
  const mockFindMany = jest.fn();
  const mockFindUnique = jest.fn();
  const mockUpdate = jest.fn();
  const mockAuditAppend = jest.fn();

  const prismaMock = {
    adminChatSession: {
      create: mockCreate,
      findMany: mockFindMany,
      findUnique: mockFindUnique,
      update: mockUpdate,
    },
  };

  const auditMock = {
    append: mockAuditAppend,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockCreate.mockResolvedValue(sessionShape);
    mockFindMany.mockResolvedValue([sessionShape]);
    mockFindUnique.mockResolvedValue(sessionShape);
    mockUpdate.mockResolvedValue(sessionShape);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminChatSessionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AdminAuditService, useValue: auditMock },
      ],
    }).compile();

    service = module.get(AdminChatSessionService);
  });

  describe('createSession', () => {
    it('creates a session with workspaceId and audit trail', async () => {
      const result = await service.createSession({
        adminUserId,
        workspaceId,
        title: 'Test Session',
      });

      expect(result).toEqual(sessionShape);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            adminUserId,
            workspaceId,
          }),
        }),
      );
    });
  });

  describe('listSessions', () => {
    it('filters sessions by workspaceId', async () => {
      const input: ListSessionsInput = { workspaceId, cursor: undefined, take: 20 };
      await service.listSessions(input);

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workspaceId: 'ws_1',
            deletedAt: null,
          }),
        }),
      );
    });

    it('does not return sessions from other workspaces', async () => {
      mockFindMany.mockResolvedValueOnce([]);

      const input: ListSessionsInput = {
        workspaceId: otherWorkspaceId,
        cursor: undefined,
        take: 20,
      };
      const result = await service.listSessions(input);

      expect(result.items).toHaveLength(0);
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workspaceId: otherWorkspaceId,
          }),
        }),
      );
    });
  });

  describe('getSession', () => {
    it('returns session when workspaceId matches', async () => {
      const result = await service.getSession('session_1', workspaceId);

      expect(result).toEqual(sessionShape);
    });

    it('throws forbidden when workspaceId does not match', async () => {
      const otherSession = { ...sessionShape, workspaceId: otherWorkspaceId };
      mockFindUnique.mockResolvedValueOnce(otherSession);

      await expect(service.getSession('session_1', workspaceId)).rejects.toThrow(/acesso negado/i);
    });

    it('throws not found when session does not exist', async () => {
      mockFindUnique.mockResolvedValueOnce(null);

      await expect(service.getSession('nonexistent', workspaceId)).rejects.toThrow(/sess.*o/i);
    });
  });

  describe('softDeleteSession', () => {
    it('soft-deletes session when workspaceId matches', async () => {
      mockUpdate.mockResolvedValueOnce({ ...sessionShape, deletedAt: new Date() });

      await service.softDeleteSession({
        id: 'session_1',
        workspaceId,
        adminUserId,
      });

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'session_1' },
          data: { deletedAt: expect.any(Date) },
        }),
      );
    });

    it('throws forbidden when trying to delete session from another workspace', async () => {
      const otherSession = { ...sessionShape, workspaceId: otherWorkspaceId };
      mockFindUnique.mockResolvedValueOnce(otherSession);

      await expect(
        service.softDeleteSession({ id: 'session_1', workspaceId, adminUserId }),
      ).rejects.toThrow(/acesso negado/i);
    });
  });
});
