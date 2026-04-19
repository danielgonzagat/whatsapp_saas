import { ForbiddenException, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { VisitorChatController } from './guest-chat.controller';

describe('VisitorChatController', () => {
  const visitorChatService = {
    chat: jest.fn(),
    chatSync: jest.fn(),
  } as any;

  const controller = new VisitorChatController(visitorChatService);
  const originalGuestChatEnabled = process.env.GUEST_CHAT_ENABLED;
  const originalVisitorChatEnabled = process.env.VISITOR_CHAT_ENABLED;
  const originalAllowedOrigins = process.env.CORS_ALLOWED_ORIGINS;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GUEST_CHAT_ENABLED = 'true';
    delete process.env.VISITOR_CHAT_ENABLED;
    delete process.env.CORS_ALLOWED_ORIGINS;
  });

  afterAll(() => {
    if (originalGuestChatEnabled === undefined) {
      delete process.env.GUEST_CHAT_ENABLED;
    } else {
      process.env.GUEST_CHAT_ENABLED = originalGuestChatEnabled;
    }

    if (originalVisitorChatEnabled === undefined) {
      delete process.env.VISITOR_CHAT_ENABLED;
    } else {
      process.env.VISITOR_CHAT_ENABLED = originalVisitorChatEnabled;
    }

    if (originalAllowedOrigins === undefined) {
      delete process.env.CORS_ALLOWED_ORIGINS;
    } else {
      process.env.CORS_ALLOWED_ORIGINS = originalAllowedOrigins;
    }
  });

  it('keeps guest and visitor aliases on every public route', () => {
    expect(Reflect.getMetadata(METHOD_METADATA, VisitorChatController.prototype.visitorChat)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, VisitorChatController.prototype.visitorChat)).toEqual(
      expect.arrayContaining(['guest', 'visitor']),
    );

    expect(
      Reflect.getMetadata(METHOD_METADATA, VisitorChatController.prototype.visitorChatSync),
    ).toBe(
      RequestMethod.POST,
    );
    expect(
      Reflect.getMetadata(PATH_METADATA, VisitorChatController.prototype.visitorChatSync),
    ).toEqual(expect.arrayContaining(['guest/sync', 'visitor/sync']));

    expect(Reflect.getMetadata(METHOD_METADATA, VisitorChatController.prototype.getSession)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, VisitorChatController.prototype.getSession)).toEqual(
      expect.arrayContaining(['guest/session', 'visitor/session']),
    );

    expect(Reflect.getMetadata(METHOD_METADATA, VisitorChatController.prototype.health)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, VisitorChatController.prototype.health)).toEqual(
      expect.arrayContaining(['guest/health', 'visitor/health']),
    );
  });

  it('returns visitor-shaped health and session payloads', () => {
    expect(controller.health()).toEqual({
      status: 'online',
      mode: 'visitor',
    });

    expect(controller.getSession().sessionId).toMatch(/^visitor_/);
  });

  it('uses a visitor session id and allowed origin in sync mode', async () => {
    process.env.CORS_ALLOWED_ORIGINS = 'https://app.kloel.com';
    visitorChatService.chatSync.mockResolvedValue('Tudo certo');

    const res = {
      setHeader: jest.fn(),
      json: jest.fn(),
    } as any;

    await controller.visitorChatSync(
      {
        message: 'oi',
      },
      {
        headers: {
          origin: 'https://app.kloel.com',
        },
      } as any,
      res,
    );

    expect(visitorChatService.chatSync).toHaveBeenCalledWith(
      'oi',
      expect.stringMatching(/^visitor_/),
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Access-Control-Allow-Origin',
      'https://app.kloel.com',
    );
    expect(res.json).toHaveBeenCalledWith({
      reply: 'Tudo certo',
      sessionId: expect.stringMatching(/^visitor_/),
    });
  });

  it('rejects visitor chat surfaces when public chat is disabled', async () => {
    process.env.GUEST_CHAT_ENABLED = 'false';

    expect(() => controller.health()).toThrow(ForbiddenException);
    expect(() => controller.getSession()).toThrow(ForbiddenException);

    await expect(
      controller.visitorChatSync(
        {
          message: 'oi',
        },
        {
          headers: {},
        } as any,
        {
          setHeader: jest.fn(),
          json: jest.fn(),
        } as any,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('accepts VISITOR_CHAT_ENABLED as the canonical public-chat flag', async () => {
    delete process.env.GUEST_CHAT_ENABLED;
    process.env.VISITOR_CHAT_ENABLED = 'false';

    expect(() => controller.health()).toThrow(ForbiddenException);

    process.env.VISITOR_CHAT_ENABLED = 'true';

    expect(controller.health()).toEqual({
      status: 'online',
      mode: 'visitor',
    });
  });

  it('prefers VISITOR_CHAT_ENABLED over the legacy guest alias when both are set', async () => {
    process.env.GUEST_CHAT_ENABLED = 'true';
    process.env.VISITOR_CHAT_ENABLED = 'false';

    expect(() => controller.getSession()).toThrow(ForbiddenException);
  });
});
