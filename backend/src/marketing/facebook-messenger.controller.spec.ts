import { BadRequestException } from '@nestjs/common';
import { FacebookMessengerController } from './facebook-messenger.controller';

jest.mock('../auth/workspace-access', () => ({
  resolveWorkspaceId: jest.fn(),
}));

jest.mock('../meta/meta-input.util', () => ({
  normalizeMetaGraphSegment: jest.fn(),
}));

import { resolveWorkspaceId } from '../auth/workspace-access';
import { normalizeMetaGraphSegment } from '../meta/meta-input.util';

const mockResolveWorkspaceId = resolveWorkspaceId as jest.Mock;
const mockNormalizeMetaGraphSegment = normalizeMetaGraphSegment as jest.Mock;

describe('FacebookMessengerController', () => {
  let controller: FacebookMessengerController;
  let fbSendMessage: jest.Mock;
  let fbGetMessages: jest.Mock;
  let fbGetConversations: jest.Mock;
  let fbGetStatus: jest.Mock;
  let metaResolveConnection: jest.Mock;

  const makeReq = (overrides?: { sub?: string; workspaceId?: string }) =>
    ({
      user: {
        sub: overrides?.sub ?? 'u-1',
        workspaceId: overrides?.workspaceId ?? 'ws-1',
        email: 'test@test.com',
        role: 'admin',
      },
      headers: {},
    }) as never;

  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveWorkspaceId.mockReturnValue('ws-1');
    mockNormalizeMetaGraphSegment.mockImplementation((value: string) => value);

    fbSendMessage = jest.fn();
    fbGetMessages = jest.fn();
    fbGetConversations = jest.fn();
    fbGetStatus = jest.fn();
    metaResolveConnection = jest.fn().mockResolvedValue({
      accessToken: 'at-1',
      pageId: 'page-1',
      pageAccessToken: 'pat-1',
    });

    controller = new FacebookMessengerController(
      {
        sendMessage: fbSendMessage,
        getMessages: fbGetMessages,
        getConversations: fbGetConversations,
        getStatus: fbGetStatus,
      } as never,
      { resolveConnection: metaResolveConnection } as never,
    );
  });

  describe('sendMessage', () => {
    it('calls sendMessage on the service with resolved workspace id, page id, psid, text, and token', async () => {
      fbSendMessage.mockResolvedValueOnce({ mid: 'mid-1', error: null });
      const req = makeReq();

      const result = await controller.sendMessage(req, {
        pageId: 'p-1',
        recipientPsid: 'psid-1',
        text: 'hello',
      });

      expect(mockResolveWorkspaceId).toHaveBeenCalledWith(req);
      expect(metaResolveConnection).toHaveBeenCalledWith('ws-1', 'facebook');
      expect(mockNormalizeMetaGraphSegment).toHaveBeenCalledWith('p-1', 'Messenger page id');
      expect(mockNormalizeMetaGraphSegment).toHaveBeenCalledWith(
        'psid-1',
        'Messenger recipient psid',
      );
      expect(fbSendMessage).toHaveBeenCalledWith('ws-1', 'p-1', 'psid-1', 'hello', 'pat-1');
      expect(result).toEqual({ mid: 'mid-1', error: null });
    });

    it('throws BadRequestException when meta connection has no access token', async () => {
      metaResolveConnection.mockResolvedValueOnce({ accessToken: null, pageId: null });
      const req = makeReq();

      await expect(
        controller.sendMessage(req, { recipientPsid: 'psid-1', text: 'hello' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when text is empty', async () => {
      const req = makeReq();

      await expect(
        controller.sendMessage(req, { recipientPsid: 'psid-1', text: '  ' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('propagates error when service rejects', async () => {
      fbSendMessage.mockRejectedValueOnce(new Error('graph-api-down'));
      const req = makeReq();

      await expect(
        controller.sendMessage(req, { recipientPsid: 'psid-1', text: 'hello' }),
      ).rejects.toThrow('graph-api-down');
    });

    it('forwards user identity from request into resolveWorkspaceId', async () => {
      fbSendMessage.mockResolvedValueOnce({ mid: 'mid-2', error: null });
      const req = makeReq({ sub: 'u-admin', workspaceId: 'ws-99' });
      mockResolveWorkspaceId.mockReturnValue('ws-99');

      await controller.sendMessage(req, { recipientPsid: 'psid-1', text: 'hi' });

      expect(mockResolveWorkspaceId).toHaveBeenCalledWith(req);
      expect(fbSendMessage).toHaveBeenCalledWith(
        'ws-99',
        'page-1',
        'psid-1',
        'hi',
        'pat-1',
      );
    });
  });

  describe('getMessages', () => {
    it('fetches messages via service with workspace-filtered args and query params', async () => {
      const messages = [{ id: 'm-1', text: 'hey' }];
      fbGetMessages.mockResolvedValueOnce(messages);
      const req = makeReq();

      const result = await controller.getMessages(req, 'p-1', '20', 'cursor-before');

      expect(mockResolveWorkspaceId).toHaveBeenCalledWith(req);
      expect(metaResolveConnection).toHaveBeenCalledWith('ws-1', 'facebook');
      expect(fbGetMessages).toHaveBeenCalledWith('ws-1', 'p-1', {
        limit: 20,
        before: 'cursor-before',
      });
      expect(result).toEqual(messages);
    });

    it('omits optional query params from options when not provided', async () => {
      fbGetMessages.mockResolvedValueOnce([]);
      const req = makeReq();

      await controller.getMessages(req, 'p-2');

      expect(fbGetMessages).toHaveBeenCalledWith('ws-1', 'p-2', {});
    });
  });

  describe('getConversations', () => {
    it('fetches conversations using resolved page id and page access token', async () => {
      const conversations = [{ id: 'c-1' }];
      fbGetConversations.mockResolvedValueOnce(conversations);
      const req = makeReq();

      const result = await controller.getConversations(req, 'p-1');

      expect(mockResolveWorkspaceId).toHaveBeenCalledWith(req);
      expect(metaResolveConnection).toHaveBeenCalledWith('ws-1', 'facebook');
      expect(fbGetConversations).toHaveBeenCalledWith('p-1', 'pat-1');
      expect(result).toEqual(conversations);
    });
  });

  describe('getStatus', () => {
    it('returns connection status from service scoped to workspace', async () => {
      const status = { connected: true, pageId: 'p-1', pageName: 'My Page' };
      fbGetStatus.mockResolvedValueOnce(status);
      const req = makeReq();

      const result = await controller.getStatus(req);

      expect(mockResolveWorkspaceId).toHaveBeenCalledWith(req);
      expect(fbGetStatus).toHaveBeenCalledWith('ws-1');
      expect(result).toEqual(status);
    });
  });
});
