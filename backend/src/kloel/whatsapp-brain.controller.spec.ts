import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { IS_PUBLIC_METADATA } from '../auth/public.decorator';
import { ROUTE_CLASS_METADATA_KEY } from '../common/throttler/route-class.decorator';
import { WhatsAppMindController } from './whatsapp-brain.controller';
import { castMock } from '../../test/helpers/cast-mock';

function isPublicHandler(method: keyof WhatsAppMindController): boolean | undefined {
  const handler = Object.getOwnPropertyDescriptor(WhatsAppMindController.prototype, method)
    ?.value as object;
  return Reflect.getMetadata(IS_PUBLIC_METADATA, handler) as boolean | undefined;
}

type ResponseStub = {
  status: jest.Mock;
  setHeader: jest.Mock;
  end: jest.Mock;
  sentStatus: number;
  sentBody: string;
};

function makeResponse(): ResponseStub {
  const res: Partial<ResponseStub> = { sentStatus: 200, sentBody: '' };
  res.status = jest.fn((code: number) => {
    res.sentStatus = code;
    return res as ResponseStub;
  });
  res.setHeader = jest.fn(() => res as ResponseStub);
  res.end = jest.fn((body: string) => {
    res.sentBody = body;
    return res as ResponseStub;
  });
  return res as ResponseStub;
}

describe('WhatsAppMindController', () => {
  const processWebhook = jest.fn();
  const handleIncomingMessage = jest.fn();
  const logWebhookEvent = jest.fn();
  const markWebhookProcessed = jest.fn();
  const markWebhookFailed = jest.fn();
  const redisSet = jest.fn();

  let controller: WhatsAppMindController;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.NODE_ENV;
    delete process.env.WHATSAPP_API_WEBHOOK_SECRET;
    delete process.env.META_APP_SECRET;
    redisSet.mockResolvedValue('OK');
    logWebhookEvent.mockResolvedValue({ id: 'evt-1' });
    markWebhookProcessed.mockResolvedValue(undefined);
    markWebhookFailed.mockResolvedValue(undefined);
    processWebhook.mockResolvedValue(undefined);

    controller = new WhatsAppMindController(
      castMock({ processWebhook, handleIncomingMessage }),
      castMock({ logWebhookEvent, markWebhookProcessed, markWebhookFailed }),
      castMock({ set: redisSet }),
    );
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('route + governance wiring', () => {
    it('mounts under kloel/whatsapp and is tagged as an ai route class', () => {
      expect(Reflect.getMetadata('path', WhatsAppMindController)).toBe('kloel/whatsapp');
      expect(Reflect.getMetadata(ROUTE_CLASS_METADATA_KEY, WhatsAppMindController)).toBe('ai');
    });

    it('marks the public webhook + verify + status routes as @Public()', () => {
      expect(isPublicHandler('verifyWebhook')).toBe(true);
      expect(isPublicHandler('receiveWebhook')).toBe(true);
      expect(isPublicHandler('getStatus')).toBe(true);
    });

    it('does NOT mark the authenticated simulate route as public', () => {
      expect(isPublicHandler('simulateConversation')).toBeUndefined();
    });
  });

  describe('verifyWebhook (Meta hub challenge handshake)', () => {
    it('echoes the sanitized challenge when token matches the configured verify token', () => {
      process.env.WHATSAPP_VERIFY_TOKEN = 'secret-token';
      const res = makeResponse();

      controller.verifyWebhook('subscribe', 'secret-token', '12345', castMock(res));

      expect(res.sentBody).toBe('12345');
      expect(res.sentStatus).toBe(200);
    });

    it('rejects with 403 when the verify token does not match', () => {
      process.env.WHATSAPP_VERIFY_TOKEN = 'secret-token';
      const res = makeResponse();

      controller.verifyWebhook('subscribe', 'wrong-token', '12345', castMock(res));

      expect(res.sentStatus).toBe(403);
    });

    it('returns 503 when WHATSAPP_VERIFY_TOKEN is not configured', () => {
      delete process.env.WHATSAPP_VERIFY_TOKEN;
      const res = makeResponse();

      controller.verifyWebhook('subscribe', 'x', 'y', castMock(res));

      expect(res.sentStatus).toBe(503);
    });
  });

  describe('receiveWebhook', () => {
    const req = castMock<Parameters<WhatsAppMindController['receiveWebhook']>[0]>({
      headers: {},
    });

    it('delegates the payload to the mind coordinator and reports ok (not a placebo)', async () => {
      const payload = { entry: [{ id: 'e1' }] };

      const result = await controller.receiveWebhook(req, payload, 'ws-1');

      expect(processWebhook).toHaveBeenCalledWith(payload, 'ws-1');
      expect(markWebhookProcessed).toHaveBeenCalledWith('evt-1');
      expect(result).toEqual({ status: 'ok' });
    });

    it('records the inbound webhook for audit before processing', async () => {
      await controller.receiveWebhook(req, { a: 1 }, 'ws-1');

      const [provider, type] = castMock<[string, string][]>(logWebhookEvent.mock.calls)[0];
      expect(provider).toBe('whatsapp_brain');
      expect(type).toBe('webhook_event');
    });

    it('short-circuits as a duplicate when Redis NX lock is already held', async () => {
      redisSet.mockResolvedValue(null);

      const result = await controller.receiveWebhook(req, { a: 1 }, 'ws-1');

      expect(result).toEqual({ status: 'ok', duplicate: true });
      expect(processWebhook).not.toHaveBeenCalled();
    });

    it('rejects when the production signature header is missing', async () => {
      process.env.NODE_ENV = 'production';
      const unsignedReq = castMock<Parameters<WhatsAppMindController['receiveWebhook']>[0]>({
        headers: {},
      });

      await expect(controller.receiveWebhook(unsignedReq, { a: 1 }, 'ws-1')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects with Forbidden when the HMAC signature does not match the secret', async () => {
      process.env.WHATSAPP_API_WEBHOOK_SECRET = 'topsecret';
      const signedReq = castMock<Parameters<WhatsAppMindController['receiveWebhook']>[0]>({
        headers: { 'x-hub-signature-256': 'sha256=deadbeef' },
      });

      await expect(controller.receiveWebhook(signedReq, { a: 1 }, 'ws-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('marks the webhook failed and surfaces an honest error when processing throws', async () => {
      processWebhook.mockRejectedValue(new Error('coordinator down'));

      const result = await controller.receiveWebhook(req, { a: 1 }, 'ws-1');

      expect(markWebhookFailed).toHaveBeenCalledWith('evt-1', 'coordinator down');
      expect(result).toEqual({ status: 'error', message: 'coordinator down' });
    });
  });

  describe('simulateConversation (reply-engine drive)', () => {
    it('forwards the inbound message and returns the real kloel reply', async () => {
      handleIncomingMessage.mockResolvedValue('Olá! Como posso ajudar?');

      const result = await controller.simulateConversation('ws-9', {
        contactMessage: 'oi',
        customerPhone: '5511999998888',
      });

      const sent = castMock<[Record<string, unknown>][]>(handleIncomingMessage.mock.calls)[0]?.[0];
      expect(sent.from).toBe('5511999998888');
      expect(sent.message).toBe('oi');
      expect(sent.workspaceId).toBe('ws-9');
      expect(result).toEqual({
        customerPhone: '5511999998888',
        kloelResponse: 'Olá! Como posso ajudar?',
      });
    });
  });

  describe('getStatus', () => {
    it('reports the brain service online', () => {
      expect(controller.getStatus()).toEqual({
        status: 'online',
        service: 'KLOEL WhatsApp Brain',
        version: '1.0.0',
      });
    });
  });
});
