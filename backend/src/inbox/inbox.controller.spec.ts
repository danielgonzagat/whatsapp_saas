import { resolveWorkspaceId } from '../auth/workspace-access';

const resolveWorkspaceIdMock = resolveWorkspaceId as jest.Mock;

jest.mock('../auth/workspace-access', () => ({
  resolveWorkspaceId: jest.fn(),
}));

import { InboxController } from './inbox.controller';

describe('InboxController', () => {
  const listAgents = jest.fn();
  const listConversations = jest.fn();
  const getMessages = jest.fn();
  const updateStatus = jest.fn();
  const assignAgent = jest.fn();
  const replyToConversation = jest.fn();

  let controller: InboxController;

  beforeEach(() => {
    jest.clearAllMocks();
    resolveWorkspaceIdMock.mockReturnValue('ws-1');
    controller = new InboxController({
      listAgents,
      listConversations,
      getMessages,
      updateStatus,
      assignAgent,
      replyToConversation,
    } as never);
  });

  describe('listAgents', () => {
    it('calls inboxService.listAgents with resolved workspaceId', async () => {
      const req = { user: { sub: 'u-1', workspaceId: 'ws-1' }, headers: {} };
      listAgents.mockResolvedValue([{ id: 'agent-1', name: 'Agent 1' }]);

      const result = await controller.listAgents(req as never, 'ws-1');

      expect(resolveWorkspaceIdMock).toHaveBeenCalledWith(req, 'ws-1');
      expect(listAgents).toHaveBeenCalledWith('ws-1');
      expect(result).toEqual([{ id: 'agent-1', name: 'Agent 1' }]);
    });
  });

  describe('getMessages', () => {
    it('calls inboxService.getMessages with conversationId and resolved workspaceId', async () => {
      const req = { user: { sub: 'u-1', workspaceId: 'ws-1' }, headers: {} };
      getMessages.mockResolvedValue([{ id: 'msg-1', content: 'Hello' }]);

      const result = await controller.getMessages(req as never, 'conv-1');

      expect(getMessages).toHaveBeenCalledWith('conv-1', 'ws-1');
      expect(result).toEqual([{ id: 'msg-1', content: 'Hello' }]);
    });

    it('propagates error when service rejects', async () => {
      const req = { user: { sub: 'u-1', workspaceId: 'ws-1' }, headers: {} };
      const error = new Error('Service down');
      getMessages.mockRejectedValue(error);

      await expect(controller.getMessages(req as never, 'conv-99')).rejects.toThrow(
        'Service down',
      );
    });
  });

  describe('closeConversation', () => {
    it('calls inboxService.updateStatus with CLOSED status', async () => {
      const req = { user: { sub: 'u-1', workspaceId: 'ws-1' }, headers: {} };
      updateStatus.mockResolvedValue({ id: 'conv-1', status: 'CLOSED' });

      const result = await controller.closeConversation(req as never, 'conv-1');

      expect(updateStatus).toHaveBeenCalledWith('ws-1', 'conv-1', 'CLOSED');
      expect(result).toEqual({ id: 'conv-1', status: 'CLOSED' });
    });
  });

  describe('assignAgent', () => {
    it('calls inboxService.assignAgent with workspaceId, conversationId, and agentId from body', async () => {
      const req = { user: { sub: 'u-1', workspaceId: 'ws-1' }, headers: {} };
      assignAgent.mockResolvedValue({ id: 'conv-1', assignedAgentId: 'agent-1' });

      const result = await controller.assignAgent(req as never, 'conv-1', 'agent-1');

      expect(assignAgent).toHaveBeenCalledWith('ws-1', 'conv-1', 'agent-1');
      expect(result).toEqual({ id: 'conv-1', assignedAgentId: 'agent-1' });
    });

    it('propagates user identity from req into service call via workspaceId', async () => {
      const req = { user: { sub: 'u-99', workspaceId: 'ws-99' }, headers: {} };
      resolveWorkspaceIdMock.mockReturnValue('ws-99');
      assignAgent.mockResolvedValue({ id: 'conv-2' });

      await controller.assignAgent(req as never, 'conv-2', 'agent-2');

      expect(resolveWorkspaceIdMock).toHaveBeenCalledWith(req);
      expect(assignAgent).toHaveBeenCalledWith('ws-99', 'conv-2', 'agent-2');
    });
  });

  describe('replyToConversation', () => {
    it('calls inboxService.replyToConversation with workspaceId, conversationId, and content from body', async () => {
      const req = { user: { sub: 'u-1', workspaceId: 'ws-1' }, headers: {} };
      replyToConversation.mockResolvedValue({ success: true });

      const result = await controller.replyToConversation(req as never, 'conv-1', 'Hello');

      expect(replyToConversation).toHaveBeenCalledWith('ws-1', 'conv-1', 'Hello');
      expect(result).toEqual({ success: true });
    });
  });
});
