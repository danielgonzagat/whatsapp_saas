import { BadRequestException } from '@nestjs/common';
import { MessengerController } from './messenger.controller';

describe('MessengerController', () => {
  const messengerService = {
    sendTextMessage: jest.fn(),
    sendMediaMessage: jest.fn(),
    getConversations: jest.fn(),
  } as any;

  const metaWhatsApp = {
    resolveConnection: jest.fn(),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses the persisted workspace page token for text messages', async () => {
    metaWhatsApp.resolveConnection.mockResolvedValue({
      pageId: 'page-1',
      pageAccessToken: 'page-token',
    });
    messengerService.sendTextMessage.mockResolvedValue({ message_id: 'msg-1' });

    const controller = new MessengerController(messengerService, metaWhatsApp);

    await expect(
      controller.sendMessage(
        { user: { workspaceId: 'ws-1' } } as any,
        {
          pageId: 'page-1',
          recipientId: 'user-1',
          text: 'Oi',
        },
      ),
    ).resolves.toEqual({ message_id: 'msg-1' });

    expect(metaWhatsApp.resolveConnection).toHaveBeenCalledWith('ws-1');
    expect(messengerService.sendTextMessage).toHaveBeenCalledWith('page-1', 'user-1', 'Oi', 'page-token');
  });

  it('rejects Messenger operations when the workspace has no persisted page token', async () => {
    metaWhatsApp.resolveConnection.mockResolvedValue({
      pageId: 'page-1',
      pageAccessToken: '',
    });

    const controller = new MessengerController(messengerService, metaWhatsApp);

    await expect(
      controller.getConversations({ user: { workspaceId: 'ws-1' } } as any, 'page-1'),
    ).rejects.toThrow(BadRequestException);
  });
});
