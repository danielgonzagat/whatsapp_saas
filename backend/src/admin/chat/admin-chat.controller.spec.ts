import { AdminChatController } from './admin-chat.controller';

describe('AdminChatController', () => {
  const sendMessage = jest.fn();
  const chatListSessions = jest.fn();
  const chatGetSession = jest.fn();
  const createSession = jest.fn();
  const sessionsListSessions = jest.fn();
  const sessionsGetSession = jest.fn();
  const updateSession = jest.fn();
  const softDeleteSession = jest.fn();

  let controller: AdminChatController;

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new AdminChatController(
      {
        sendMessage,
        listSessions: chatListSessions,
        getSession: chatGetSession,
      } as never,
      {
        createSession,
        listSessions: sessionsListSessions,
        getSession: sessionsGetSession,
        updateSession,
        softDeleteSession,
      } as never,
    );
  });

  describe('POST message (send)', () => {
    it('calls chat.sendMessage with admin id, role, sessionId, and content', async () => {
      sendMessage.mockResolvedValue({ id: 's-1' });

      const admin = { id: 'admin-1', role: 'OWNER' } as never;
      const dto = { sessionId: 'sess-1', content: 'Hello' };

      const result = await controller.send(dto, admin);

      expect(sendMessage).toHaveBeenCalledWith({
        adminUserId: 'admin-1',
        adminRole: 'OWNER',
        sessionId: 'sess-1',
        content: 'Hello',
      });
      expect(result).toEqual({ id: 's-1' });
    });

    it('passes null sessionId when dto has no sessionId', async () => {
      sendMessage.mockResolvedValue({ id: 's-2' });

      const admin = { id: 'admin-2', role: 'OWNER' } as never;
      const dto = { content: 'Hello' };

      await controller.send(dto, admin);

      expect(sendMessage).toHaveBeenCalledWith({
        adminUserId: 'admin-2',
        adminRole: 'OWNER',
        sessionId: null,
        content: 'Hello',
      });
    });
  });

  describe('POST sessions (create)', () => {
    it('calls sessions.createSession with adminUserId, workspaceId, and title', async () => {
      createSession.mockResolvedValue({ id: 'sess-1' });

      const admin = { id: 'admin-1', role: 'OWNER' } as never;
      const dto = { workspaceId: 'ws-1', title: 'My Session' };

      const result = await controller.create(dto, admin);

      expect(createSession).toHaveBeenCalledWith({
        adminUserId: 'admin-1',
        workspaceId: 'ws-1',
        title: 'My Session',
      });
      expect(result).toEqual({ id: 'sess-1' });
    });
  });

  describe('GET sessions (list)', () => {
    it('delegates to sessions.listSessions when workspaceId query is present', async () => {
      sessionsListSessions.mockResolvedValue({ items: [], nextCursor: null });

      const admin = { id: 'admin-1' } as never;

      const result = await controller.list(admin, 'ws-1', 'cursor-1', '10');

      expect(sessionsListSessions).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        cursor: 'cursor-1',
        take: 10,
      });
      expect(chatListSessions).not.toHaveBeenCalled();
      expect(result).toEqual({ items: [], nextCursor: null });
    });

    it('delegates to chat.listSessions with admin.id when no workspaceId', async () => {
      chatListSessions.mockResolvedValue([{ id: 's-1' }]);

      const admin = { id: 'admin-1' } as never;

      const result = await controller.list(admin);

      expect(chatListSessions).toHaveBeenCalledWith('admin-1', undefined);
      expect(sessionsListSessions).not.toHaveBeenCalled();
      expect(result).toEqual([{ id: 's-1' }]);
    });
  });

  describe('GET sessions/:id (get)', () => {
    it('calls sessions.getSession when workspaceId query is present', async () => {
      sessionsGetSession.mockResolvedValue({ id: 'sess-1' });

      const admin = { id: 'admin-1' } as never;

      const result = await controller.get('sess-1', admin, 'ws-1');

      expect(sessionsGetSession).toHaveBeenCalledWith('sess-1', 'ws-1');
      expect(chatGetSession).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 'sess-1' });
    });

    it('calls chat.getSession with admin.id when no workspaceId', async () => {
      chatGetSession.mockResolvedValue({ id: 'sess-1' });

      const admin = { id: 'admin-1' } as never;

      const result = await controller.get('sess-1', admin);

      expect(chatGetSession).toHaveBeenCalledWith('admin-1', 'sess-1');
      expect(sessionsGetSession).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 'sess-1' });
    });
  });

  describe('PATCH sessions/:id (update)', () => {
    it('calls sessions.updateSession with id, workspaceId, and title', async () => {
      updateSession.mockResolvedValue({ id: 'sess-1', title: 'New Title' });

      const dto = { title: 'New Title' };

      const result = await controller.update('sess-1', dto, 'ws-1');

      expect(updateSession).toHaveBeenCalledWith({
        id: 'sess-1',
        workspaceId: 'ws-1',
        title: 'New Title',
      });
      expect(result).toEqual({ id: 'sess-1', title: 'New Title' });
    });
  });

  describe('DELETE sessions/:id (remove)', () => {
    it('calls sessions.softDeleteSession with id, workspaceId, and adminUserId', async () => {
      softDeleteSession.mockResolvedValue(undefined);

      const admin = { id: 'admin-1', role: 'OWNER' } as never;

      await controller.remove('sess-1', 'ws-1', admin);

      expect(softDeleteSession).toHaveBeenCalledWith({
        id: 'sess-1',
        workspaceId: 'ws-1',
        adminUserId: 'admin-1',
      });
    });
  });

  describe('error propagation', () => {
    it('propagates error from chat.sendMessage', async () => {
      sendMessage.mockRejectedValue(new Error('Forbidden'));

      const admin = { id: 'admin-1', role: 'OWNER' } as never;
      const dto = { content: 'Hello' };

      await expect(controller.send(dto, admin)).rejects.toThrow('Forbidden');
    });

    it('propagates error from sessions.createSession', async () => {
      createSession.mockRejectedValue(new Error('Duplicate'));

      const admin = { id: 'admin-1' } as never;
      const dto = { workspaceId: 'ws-1' };

      await expect(controller.create(dto, admin)).rejects.toThrow('Duplicate');
    });
  });
});
