import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { InboundProcessorService } from './inbound-processor.service';
import { WorkspaceService } from '../workspaces/workspace.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from './whatsapp.service';
import { ChannelTransportRegistry } from '../kloel/channel-transport.registry';
import { InternalWhatsAppRuntimeController } from './internal-whatsapp-runtime.controller';

const INTERNAL_KEY = 'test-key-123';

describe('InternalWhatsAppRuntimeController', () => {
  let controller: InternalWhatsAppRuntimeController;
  let inboundProcessor: { process: jest.Mock };
  let workspaceService: { patchSettings: jest.Mock };
  let whatsappService: {
    sendMessage: jest.Mock;
    getConnectionStatus: jest.Mock;
    listChats: jest.Mock;
    getChatMessages: jest.Mock;
    setPresence: jest.Mock;
  };
  let transports: { send: jest.Mock };
  let prisma: { contact: { findUnique: jest.Mock; upsert: jest.Mock } };

  const ws = 'ws-1';

  beforeAll(() => {
    process.env.INTERNAL_API_KEY = INTERNAL_KEY;
  });

  afterAll(() => {
    delete process.env.INTERNAL_API_KEY;
  });

  beforeEach(async () => {
    inboundProcessor = { process: jest.fn().mockResolvedValue({ handled: true }) };
    workspaceService = { patchSettings: jest.fn().mockResolvedValue(undefined) };
    whatsappService = {
      sendMessage: jest.fn().mockResolvedValue({ messageId: 'msg-1' }),
      getConnectionStatus: jest.fn().mockResolvedValue({ connected: true }),
      listChats: jest.fn().mockResolvedValue([]),
      getChatMessages: jest.fn().mockResolvedValue([]),
      setPresence: jest.fn().mockResolvedValue(undefined),
    };
    transports = { send: jest.fn().mockResolvedValue(undefined) };
    prisma = {
      contact: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: 'c-1', name: 'Test', phone: '5511999999999' }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InternalWhatsAppRuntimeController],
      providers: [
        { provide: InboundProcessorService, useValue: inboundProcessor },
        { provide: WorkspaceService, useValue: workspaceService },
        { provide: PrismaService, useValue: prisma },
        { provide: WhatsappService, useValue: whatsappService },
        { provide: ChannelTransportRegistry, useValue: transports },
      ],
    }).compile();
    controller = module.get(InternalWhatsAppRuntimeController);
  });

  describe('ingestInbound', () => {
    it('processes an inbound message with valid internal key', async () => {
      const body = { from: '5511999999999', body: 'hello', provider: 'meta-cloud' };
      const result = await controller.ingestInbound(body, INTERNAL_KEY);
      expect(result.success).toBe(true);
      expect(inboundProcessor.process).toHaveBeenCalled();
    });

    it('throws ForbiddenException with invalid key', async () => {
      await expect(controller.ingestInbound({ from: 'x' }, 'wrong-key')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('sessionConnected', () => {
    it('activates autopilot on session connected', async () => {
      const result = await controller.sessionConnected({ workspaceId: ws }, INTERNAL_KEY);
      expect(result.success).toBe(true);
      expect(result.autopilotEnabled).toBe(true);
      expect(workspaceService.patchSettings).toHaveBeenCalledWith(ws, expect.objectContaining({
        whatsappProvider: 'meta-cloud',
      }));
    });

    it('returns failure when workspaceId is missing', async () => {
      const result = await controller.sessionConnected({ workspaceId: '' }, INTERNAL_KEY);
      expect(result.success).toBe(false);
    });
  });

  describe('sendText', () => {
    it('sends a text message via whatsapp service', async () => {
      const result = await controller.sendText({ workspaceId: ws, to: '5511999999999', message: 'Hi' }, INTERNAL_KEY);
      expect(whatsappService.sendMessage).toHaveBeenCalledWith(ws, '5511999999999', 'Hi', expect.objectContaining({ forceDirect: true }));
    });

    it('throws UnauthorizedException without internal key', async () => {
      delete process.env.INTERNAL_API_KEY;
      await expect(controller.sendText({ workspaceId: ws, to: 'x', message: 'Hi' })).rejects.toThrow(UnauthorizedException);
      process.env.INTERNAL_API_KEY = INTERNAL_KEY;
    });
  });

  describe('sendMedia', () => {
    it('sends media via channel transport', async () => {
      await controller.sendMedia({ workspaceId: ws, to: '5511999999999', mediaUrl: 'https://img.example/pic.jpg', caption: 'Look' }, INTERNAL_KEY);
      expect(transports.send).toHaveBeenCalledWith(ws, expect.objectContaining({ mediaUrl: 'https://img.example/pic.jpg' }));
    });
  });

  describe('getStatus', () => {
    it('returns connection status', async () => {
      const result = await controller.getStatus(ws, INTERNAL_KEY);
      expect(result.connected).toBe(true);
    });
  });

  describe('getChats', () => {
    it('returns chat list', async () => {
      const result = await controller.getChats(ws, INTERNAL_KEY);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('getMessages', () => {
    it('returns messages with clamped pagination', async () => {
      await controller.getMessages(ws, 'chat-1', '50', '0', INTERNAL_KEY);
      expect(whatsappService.getChatMessages).toHaveBeenCalledWith(ws, 'chat-1', { limit: 50, offset: 0 });
    });

    it('clamps limit to max 100', async () => {
      await controller.getMessages(ws, 'chat-1', '999', '0', INTERNAL_KEY);
      expect(whatsappService.getChatMessages).toHaveBeenCalledWith(ws, 'chat-1', { limit: 100, offset: 0 });
    });

    it('defaults limit to 100 when invalid', async () => {
      await controller.getMessages(ws, 'chat-1', undefined as unknown as string, undefined as unknown as string, INTERNAL_KEY);
      expect(whatsappService.getChatMessages).toHaveBeenCalledWith(ws, 'chat-1', { limit: 100, offset: 0 });
    });
  });

  describe('readChat', () => {
    it('marks chat as seen', async () => {
      await controller.readChat({ workspaceId: ws, chatId: 'chat-1' }, INTERNAL_KEY);
      expect(whatsappService.setPresence).toHaveBeenCalledWith(ws, 'chat-1', 'seen');
    });
  });

  describe('syncContact', () => {
    it('syncs a contact and upserts in DB', async () => {
      const result = await controller.syncContact({ workspaceId: ws, phone: '(11) 99999-9999', name: 'John' }, INTERNAL_KEY);
      expect(result.success).toBe(true);
      expect(result.contactId).toBe('c-1');
    });

    it('returns failure when fields are missing', async () => {
      const result = await controller.syncContact({ workspaceId: '', phone: '', name: '' }, INTERNAL_KEY);
      expect(result.success).toBe(false);
      expect(result.reason).toBe('missing_fields');
    });

    it('throws ForbiddenException with invalid key', async () => {
      await expect(
        controller.syncContact({ workspaceId: ws, phone: '11999999999', name: 'John' }, 'wrong-key'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
