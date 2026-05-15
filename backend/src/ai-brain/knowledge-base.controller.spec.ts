import { KnowledgeBaseController } from './knowledge-base.controller';

jest.mock('../auth/workspace-access', () => ({
  resolveWorkspaceId: jest.fn(),
}));

import { resolveWorkspaceId } from '../auth/workspace-access';
const resolveWorkspaceIdMock = resolveWorkspaceId as jest.Mock;

jest.mock('../logging/structured-logger', () => ({
  StructuredLogger: {
    from: jest.fn().mockReturnValue({
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      log: jest.fn(),
    }),
  },
}));

describe('KnowledgeBaseController', () => {
  const kbCreate = jest.fn();
  const kbList = jest.fn();
  const kbAddSource = jest.fn();
  const kbListSources = jest.fn();
  const agentAnalyzeSentiment = jest.fn();
  const agentSummarize = jest.fn();
  const agentSuggest = jest.fn();
  const agentPitch = jest.fn();

  let controller: KnowledgeBaseController;

  const admin = { id: 'a-1', role: 'OWNER' } as never;

  beforeEach(() => {
    jest.clearAllMocks();
    resolveWorkspaceIdMock.mockReturnValue('ws-1');

    controller = new KnowledgeBaseController(
      {
        create: kbCreate,
        list: kbList,
        addSource: kbAddSource,
        listSources: kbListSources,
      } as never,
      {
        analyzeSentiment: agentAnalyzeSentiment,
        summarizeConversation: agentSummarize,
        suggestReply: agentSuggest,
        generatePitch: agentPitch,
      } as never,
    );
  });

  describe('createKb', () => {
    it('calls kb.create with resolved workspaceId and name from body', async () => {
      kbCreate.mockResolvedValue({ id: 'kb-1', name: 'My KB' });
      const req = { user: { sub: 'a-1', workspaceId: 'ws-1', role: 'ADMIN', email: 'a@b.com' } };
      const body = { name: 'My KB' };

      const result = await controller.createKb(req as never, body);

      expect(kbCreate).toHaveBeenCalledWith('ws-1', 'My KB');
      expect(result).toEqual({ id: 'kb-1', name: 'My KB' });
    });
  });

  describe('listKb', () => {
    it('calls kb.list with resolved workspaceId', async () => {
      kbList.mockResolvedValue([{ id: 'kb-1', name: 'KB 1' }]);
      const req = { user: { sub: 'a-1', workspaceId: 'ws-1', role: 'ADMIN' } };

      const result = await controller.listKb(req as never, 'ws-1');

      expect(kbList).toHaveBeenCalledWith('ws-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('addSource', () => {
    it('calls kb.addSource with kbId, type, content and resolved workspaceId', async () => {
      kbAddSource.mockResolvedValue({ id: 'src-1', status: 'PENDING' });
      const req = { user: { sub: 'a-1', workspaceId: 'ws-1', role: 'ADMIN' } };
      const body = { knowledgeBaseId: 'kb-1', type: 'TEXT' as const, content: 'article text' };

      const result = await controller.addSource(req as never, body);

      expect(kbAddSource).toHaveBeenCalledWith('kb-1', 'TEXT', 'article text', 'ws-1');
      expect(result).toEqual({ id: 'src-1', status: 'PENDING' });
    });
  });

  describe('listSources', () => {
    it('calls kb.listSources with kbId from params and resolved workspaceId', async () => {
      kbListSources.mockResolvedValue([{ id: 'src-1', type: 'TEXT' }]);
      const req = { user: { sub: 'a-1', workspaceId: 'ws-1', role: 'ADMIN' } };

      const result = await controller.listSources(req as never, 'kb-1');

      expect(kbListSources).toHaveBeenCalledWith('kb-1', 'ws-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('error propagation', () => {
    it('propagates error when kb.list rejects', async () => {
      kbList.mockRejectedValue(new Error('database unavailable'));
      const req = { user: { sub: 'a-1', workspaceId: 'ws-1', role: 'ADMIN' } };

      await expect(controller.listKb(req as never, 'ws-1')).rejects.toThrow('database unavailable');
    });
  });

  describe('identity propagation', () => {
    it('passes req.user sub and workspaceId through resolveWorkspaceId into service call', async () => {
      resolveWorkspaceIdMock.mockReturnValue('ws-from-user');
      kbCreate.mockResolvedValue({ id: 'kb-1' });
      const req = {
        user: { sub: 'user-42', workspaceId: 'ws-from-user', role: 'ADMIN', email: 'a@b.com' },
      };
      const body = { name: 'KB', workspaceId: 'ws-from-user' };

      await controller.createKb(req as never, body);

      expect(resolveWorkspaceId).toHaveBeenCalledWith(
        expect.objectContaining({ user: req.user }),
        body.workspaceId,
      );
      expect(kbCreate).toHaveBeenCalledWith('ws-from-user', 'KB');
    });

    it('propagates DTO fields from body into addSource call', async () => {
      resolveWorkspaceIdMock.mockReturnValue('ws-dto');
      kbAddSource.mockResolvedValue({ id: 'src-dto', status: 'PENDING' });
      const req = { user: { sub: 'u-1', workspaceId: 'ws-dto', role: 'ADMIN' } };
      const body = {
        knowledgeBaseId: 'kb-dto',
        type: 'URL' as const,
        content: 'https://example.com',
        workspaceId: 'ws-dto',
      };

      await controller.addSource(req as never, body);

      expect(kbAddSource).toHaveBeenCalledWith('kb-dto', 'URL', 'https://example.com', 'ws-dto');
    });
  });
});
