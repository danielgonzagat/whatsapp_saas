import { GuestChatController } from './guest-chat.controller';

jest.mock('./guest-chat.service', () => ({
  GuestChatService: jest.fn().mockImplementation(() => ({
    chat: jest.fn(),
    chatSync: jest.fn(),
  })),
}));

jest.mock('../logging/structured-logger', () => ({
  StructuredLogger: {
    from: jest.fn().mockReturnValue({
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

import { GuestChatService } from './guest-chat.service';
import { ForbiddenException } from '@nestjs/common';

const serviceMock = new GuestChatService(null as never, null as never, null as never);
const chatMock = serviceMock.chat as jest.Mock;
const chatSyncMock = serviceMock.chatSync as jest.Mock;

describe('GuestChatController', () => {
  let controller: GuestChatController;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GUEST_CHAT_ENABLED = 'true';
    controller = new GuestChatController(serviceMock);
  });

  describe('guestChat (POST /chat/guest)', () => {
    it('calls service.chat with message, sessionId from dto, req and res', async () => {
      chatMock.mockResolvedValue(undefined);
      const dto = { message: 'Hello AI', sessionId: 'sess-1' };
      const req = { headers: { origin: 'https://example.com' } } as never;
      const res = { setHeader: jest.fn(), flushHeaders: jest.fn(), end: jest.fn() } as never;

      await controller.guestChat(dto, req, res);

      expect(chatMock).toHaveBeenCalledWith('Hello AI', 'sess-1', req, res);
    });

    it('uses header sessionId when dto.sessionId is absent', async () => {
      chatMock.mockResolvedValue(undefined);
      const dto = { message: 'Hello AI' };
      const req = { headers: { origin: 'https://example.com' } } as never;
      const res = { setHeader: jest.fn(), flushHeaders: jest.fn(), end: jest.fn() } as never;

      await controller.guestChat(dto, req, res, 'hdr-sess-1');

      expect(chatMock).toHaveBeenCalledWith('Hello AI', 'hdr-sess-1', req, res);
    });

    it('generates a fresh sessionId when neither dto nor header provides one', async () => {
      chatMock.mockResolvedValue(undefined);
      const dto = { message: 'Hello AI' };
      const req = { headers: { origin: 'https://example.com' } } as never;
      const res = { setHeader: jest.fn(), flushHeaders: jest.fn(), end: jest.fn() } as never;

      await controller.guestChat(dto, req, res);

      expect(chatMock).toHaveBeenCalledTimes(1);
      const sessionIdArg = chatMock.mock.calls[0][1] as string;
      expect(sessionIdArg).toMatch(/^guest_/);
    });
  });

  describe('guestChatSync (POST /chat/guest/sync)', () => {
    it('calls service.chatSync with message and sessionId, responds with reply via res.json', async () => {
      chatSyncMock.mockResolvedValue('Hello, welcome to Kloel!');
      const dto = { message: 'Hi', sessionId: 'sess-2' };
      const req = { headers: { origin: 'https://example.com' } } as never;
      const json = jest.fn();
      const res = { setHeader: jest.fn(), json } as never;

      await controller.guestChatSync(dto, req, res);

      expect(chatSyncMock).toHaveBeenCalledWith('Hi', 'sess-2', undefined);
      expect(json).toHaveBeenCalledWith({ reply: 'Hello, welcome to Kloel!', sessionId: 'sess-2' });
    });
  });

  describe('error propagation', () => {
    it('propagates error when service.chat throws', async () => {
      chatMock.mockRejectedValue(new Error('LLM provider unavailable'));
      const dto = { message: 'Hello AI', sessionId: 'sess-3' };
      const req = { headers: {} } as never;
      const res = {} as never;

      await expect(controller.guestChat(dto, req, res)).rejects.toThrow('LLM provider unavailable');
    });
  });

  describe('guest chat disabled', () => {
    it('throws ForbiddenException when GUEST_CHAT_ENABLED is false', async () => {
      process.env.GUEST_CHAT_ENABLED = 'false';
      const dto = { message: 'Hello AI' };
      const req = { headers: {} } as never;
      const res = {} as never;

      await expect(controller.guestChat(dto, req, res)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getSession (GET /chat/guest/session)', () => {
    it('returns a generated sessionId', () => {
      const result = controller.getSession();

      expect(result).toHaveProperty('sessionId');
      expect(result.sessionId).toMatch(/^guest_/);
    });
  });

  describe('health (GET /chat/guest/health)', () => {
    it('returns online status in guest mode', () => {
      const result = controller.health();

      expect(result).toEqual({ status: 'online', mode: 'guest' });
    });
  });
});
