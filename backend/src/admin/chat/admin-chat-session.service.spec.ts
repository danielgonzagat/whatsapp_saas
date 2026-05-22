import { Test, TestingModule } from '@nestjs/testing';
import { AdminAuditService } from '../audit/admin-audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminChatSessionService } from './admin-chat-session.service';

type ListSessionsInput = Parameters<AdminChatSessionService['listSessions']>[0];

const sessionWithoutMessages = {
  id: 'session_1',
  adminUserId: 'admin_1',
  workspaceId: 'ws_1',
  title: 'Test Session',
  createdAt: new Date('2026-05-10T00:00:00Z'),
  updatedAt: new Date('2026-05-10T00:00:00Z'),
  lastUsedAt: new Date('2026-05-10T12:00:00Z'),
  expiresAt: new Date('2026-05-11T12:00:00Z'),
  deletedAt: null as Date | null,
};

const sessionShape = {
  ...sessionWithoutMessages,
  messages: [] as Array<Record<string, unknown>>,
};

function firstCallArg<T>(mock: { mock: { calls: Array<[unknown, ...unknown[]]> } }): T {
  const [arg] = mock.mock.calls[0] ?? [];
  return arg as T;
}

type AdminChatSessionQueryArgs = {
  where?: {
    id?: string;
    workspaceId?: string;
    deletedAt?: null;
  };
  data?: {
    deletedAt?: Date;
  };
};

describe('AdminChatSessionService', () => {
  let service: AdminChatSessionService;

  const workspaceId = 'ws_1';
  const otherWorkspaceId = 'ws_2';
  const adminUserId = 'admin_1';

  const mockCreate = jest.fn();
  const mockFindMany = jest.fn();
  const mockFindFirst = jest.fn();
  const mockFindFirstOrThrow = jest.fn();
  const mockFindUnique = jest.fn();
  const mockUpdate = jest.fn();
  const mockUpdateMany = jest.fn();
  const mockAuditAppend = jest.fn();

  const prismaMock = {
    adminChatSession: {
      create: mockCreate,
      findMany: mockFindMany,
      findFirst: mockFindFirst,
      findFirstOrThrow: mockFindFirstOrThrow,
      findUnique: mockFindUnique,
      update: mockUpdate,
      updateMany: mockUpdateMany,
    },
  };

  const auditMock = {
    append: mockAuditAppend,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockCreate.mockResolvedValue(sessionWithoutMessages);
    mockFindMany.mockResolvedValue([sessionShape]);
    mockFindFirst.mockResolvedValue(sessionShape);
    mockFindFirstOrThrow.mockResolvedValue(sessionShape);
    mockFindUnique.mockResolvedValue(sessionShape);
    mockUpdate.mockResolvedValue(sessionShape);
    mockUpdateMany.mockResolvedValue({ count: 1 });

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
      const args = firstCallArg<{ data?: { adminUserId?: string; workspaceId?: string } }>(
        mockCreate,
      );
      expect(args.data).toMatchObject({ adminUserId, workspaceId });
    });
  });

  describe('listSessions', () => {
    it('filters sessions by workspaceId', async () => {
      const input: ListSessionsInput = { workspaceId, cursor: undefined, take: 20 };
      await service.listSessions(input);

      const args = firstCallArg<AdminChatSessionQueryArgs>(mockFindMany);
      expect(args.where).toMatchObject({ workspaceId: 'ws_1', deletedAt: null });
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
      const args = firstCallArg<AdminChatSessionQueryArgs>(mockFindMany);
      expect(args.where).toMatchObject({ workspaceId: otherWorkspaceId });
    });
  });

  describe('getSession', () => {
    it('returns session when workspaceId matches', async () => {
      const result = await service.getSession('session_1', workspaceId);

      expect(result).toEqual(sessionShape);
    });

    it('throws forbidden when workspaceId does not match', async () => {
      mockFindFirst.mockResolvedValueOnce(null);

      await expect(service.getSession('session_1', workspaceId)).rejects.toThrow(/sess.*o/i);
    });

    it('throws not found when session does not exist', async () => {
      mockFindFirst.mockResolvedValueOnce(null);

      await expect(service.getSession('nonexistent', workspaceId)).rejects.toThrow(/sess.*o/i);
    });
  });

  describe('updateSession', () => {
    it('returns the updated session with persisted messages for the admin UI contract', async () => {
      const result = await service.updateSession({
        id: 'session_1',
        workspaceId,
        title: 'Renamed Session',
      });

      expect(result).toEqual(sessionShape);
      const reloadArgs = firstCallArg<{
        where?: { id?: string; workspaceId?: string; deletedAt?: null };
        include?: unknown;
      }>(mockFindFirstOrThrow);
      expect(reloadArgs.where).toEqual({ id: 'session_1', workspaceId, deletedAt: null });
      expect(reloadArgs.include).toEqual({ messages: { orderBy: { createdAt: 'asc' } } });
    });
  });

  describe('softDeleteSession', () => {
    it('soft-deletes session when workspaceId matches', async () => {
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });

      await service.softDeleteSession({
        id: 'session_1',
        workspaceId,
        adminUserId,
      });

      const updateArgs = firstCallArg<AdminChatSessionQueryArgs>(mockUpdateMany);
      expect(updateArgs.where).toEqual({ id: 'session_1', workspaceId });
      expect(updateArgs.data?.deletedAt).toBeInstanceOf(Date);
    });

    it('throws forbidden when trying to delete session from another workspace', async () => {
      mockFindFirst.mockResolvedValueOnce(null);

      await expect(
        service.softDeleteSession({ id: 'session_1', workspaceId, adminUserId }),
      ).rejects.toThrow(/sess.*o/i);
    });
  });
});
