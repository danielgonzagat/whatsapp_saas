import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminPermissionsService } from '../permissions/admin-permissions.service';
import { AdminChatService } from './admin-chat.service';
import { ChatToolRegistry } from './chat-tool.registry';

const sessionViewShape = {
  id: 'session_1',
  title: 'Test',
  createdAt: '2026-05-10T00:00:00.000Z',
  lastUsedAt: '2026-05-10T12:00:00.000Z',
  expiresAt: '2026-05-11T12:00:00.000Z',
  messages: [],
};

function firstCallArg<T>(mock: { mock: { calls: Array<[unknown, ...unknown[]]> } }): T {
  const [arg] = mock.mock.calls[0] ?? [];
  return arg as T;
}

type AdminChatSessionQueryArgs = {
  where?: {
    id?: string;
    adminUserId?: string;
    workspaceId?: string | { not: string };
  };
};

describe('AdminChatService', () => {
  let service: AdminChatService;

  const adminUserId = 'admin_1';
  const workspaceId = 'ws_1';

  const sessionRecord = {
    id: 'session_1',
    adminUserId,
    workspaceId,
    title: 'Test',
    createdAt: new Date('2026-05-10T00:00:00Z'),
    updatedAt: new Date('2026-05-10T00:00:00Z'),
    lastUsedAt: new Date('2026-05-10T12:00:00Z'),
    expiresAt: new Date('2026-05-11T12:00:00Z'),
    deletedAt: null as Date | null,
    messages: [],
  };

  const mockSessionCreate = jest.fn();
  const mockSessionFindMany = jest.fn();
  const mockSessionFindFirst = jest.fn();
  const mockSessionFindUnique = jest.fn();
  const mockSessionUpdate = jest.fn();
  const mockSessionUpdateMany = jest.fn();
  const mockMsgCreate = jest.fn();
  const mockAgentFindUnique = jest.fn();
  const mockPermissionsAllows = jest.fn();
  const mockPermissionsIsPlatformAdmin = jest.fn();
  const mockToolsResolve = jest.fn();
  const mockToolsListAll = jest.fn();
  const mockToolsRegister = jest.fn();

  const prismaMock = {
    adminChatSession: {
      create: mockSessionCreate,
      findMany: mockSessionFindMany,
      findFirst: mockSessionFindFirst,
      findUnique: mockSessionFindUnique,
      update: mockSessionUpdate,
      updateMany: mockSessionUpdateMany,
    },
    adminChatMessage: {
      create: mockMsgCreate,
    },
    agent: {
      findUnique: mockAgentFindUnique,
    },
  };

  const permissionsMock = {
    allows: mockPermissionsAllows,
    isPlatformAdmin: mockPermissionsIsPlatformAdmin,
  };

  const toolsMock = {
    resolve: mockToolsResolve,
    listAll: mockToolsListAll,
    register: mockToolsRegister,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockSessionCreate.mockResolvedValue(sessionRecord);
    mockSessionFindMany.mockResolvedValue([sessionRecord]);
    mockSessionFindFirst.mockResolvedValue(sessionRecord);
    mockSessionFindUnique.mockResolvedValue(sessionRecord);
    mockSessionUpdate.mockResolvedValue(sessionRecord);
    mockSessionUpdateMany.mockResolvedValue({ count: 1 });
    mockMsgCreate.mockResolvedValue({ id: 'msg_1' });
    mockAgentFindUnique.mockResolvedValue(null);
    mockPermissionsAllows.mockResolvedValue(true);
    mockPermissionsIsPlatformAdmin.mockResolvedValue(true);
    mockToolsResolve.mockReturnValue(null);
    mockToolsListAll.mockReturnValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminChatService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AdminPermissionsService, useValue: permissionsMock },
        { provide: ChatToolRegistry, useValue: toolsMock },
      ],
    }).compile();

    service = module.get(AdminChatService);
  });

  describe('listSessions', () => {
    it('filters sessions by adminUserId when no workspaceId provided', async () => {
      const result = await service.listSessions(adminUserId);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(sessionViewShape.id);
      const args = firstCallArg<AdminChatSessionQueryArgs>(mockSessionFindMany);
      expect(args.where).toMatchObject({ adminUserId });
    });

    it('additionally filters by workspaceId when provided', async () => {
      await service.listSessions(adminUserId, workspaceId);

      const args = firstCallArg<AdminChatSessionQueryArgs>(mockSessionFindMany);
      expect(args.where).toMatchObject({ adminUserId, workspaceId });
    });

    it('does not return sessions from other admins', async () => {
      mockSessionFindMany.mockResolvedValueOnce([]);

      const result = await service.listSessions('other_admin');

      expect(result).toHaveLength(0);
    });
  });

  describe('getSession', () => {
    it('returns session when adminUserId matches', async () => {
      const result = await service.getSession(adminUserId, 'session_1');

      expect(result.id).toBe(sessionViewShape.id);
    });

    it('throws forbidden when adminUserId does not match', async () => {
      mockSessionFindFirst.mockResolvedValueOnce(null);

      await expect(service.getSession(adminUserId, 'session_1')).rejects.toThrow(/acesso negado/i);
      const args = firstCallArg<AdminChatSessionQueryArgs>(mockSessionFindFirst);
      expect(args.where).toEqual({ id: 'session_1', adminUserId, workspaceId: { not: '' } });
    });
  });
});
