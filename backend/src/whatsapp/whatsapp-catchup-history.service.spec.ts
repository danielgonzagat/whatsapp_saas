import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppProviderRegistry } from './providers/provider-registry';
import { INBOX_SERVICE } from '../inbox/inbox.token';
import { OpsAlertService } from '../observability/ops-alert.service';
import { WhatsappCatchupHistoryService } from './whatsapp-catchup-history.service';

describe('WhatsappCatchupHistoryService', () => {
  let service: WhatsappCatchupHistoryService;
  let prisma: object;
  let providerRegistry: { extractPhoneFromChatId: jest.Mock };
  let inbox: object;

  beforeEach(async () => {
    prisma = {};
    providerRegistry = {
      extractPhoneFromChatId: jest.fn().mockImplementation((id: string) =>
        String(id || '').replace(/\D/g, ''),
      ),
    };
    inbox = { saveMessageByPhone: jest.fn().mockResolvedValue(undefined) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappCatchupHistoryService,
        { provide: PrismaService, useValue: prisma },
        { provide: WhatsAppProviderRegistry, useValue: providerRegistry },
        { provide: INBOX_SERVICE, useValue: inbox },
        { provide: OpsAlertService, useValue: { alertOnCriticalError: jest.fn() } },
      ],
    }).compile();
    service = module.get(WhatsappCatchupHistoryService);
  });

  describe('isPlaceholderContactName', () => {
    it('treats empty/whitespace-only names as placeholder', () => {
      expect(service.isPlaceholderContactName('')).toBe(true);
      expect(service.isPlaceholderContactName('   ')).toBe(true);
    });

    it('recognizes "doe", "unknown", "desconhecido" as placeholders', () => {
      expect(service.isPlaceholderContactName('Doe')).toBe(true);
      expect(service.isPlaceholderContactName('UNKNOWN')).toBe(true);
      expect(service.isPlaceholderContactName('desconhecido')).toBe(true);
    });

    it('accepts real names', () => {
      expect(service.isPlaceholderContactName('Alice Silva')).toBe(false);
    });

    it('rejects "<phone> doe" pattern', () => {
      expect(service.isPlaceholderContactName('+5511999991234 doe')).toBe(true);
    });

    it('rejects when normalized name equals phone digits', () => {
      expect(service.isPlaceholderContactName('5511999991234', '+5511 99999-1234')).toBe(true);
    });
  });

  describe('mapInboundType', () => {
    it('maps "chat" and "text" → text', () => {
      expect(service.mapInboundType('chat')).toBe('text');
      expect(service.mapInboundType('text')).toBe('text');
    });

    it('maps "ptt" and "audio" → audio', () => {
      expect(service.mapInboundType('ptt')).toBe('audio');
      expect(service.mapInboundType('audio')).toBe('audio');
    });

    it('maps image/document/video/sticker', () => {
      expect(service.mapInboundType('image')).toBe('image');
      expect(service.mapInboundType('document')).toBe('document');
      expect(service.mapInboundType('video')).toBe('video');
      expect(service.mapInboundType('sticker')).toBe('sticker');
    });

    it('returns "unknown" for unrecognized types', () => {
      expect(service.mapInboundType('weird')).toBe('unknown');
      expect(service.mapInboundType(undefined)).toBe('unknown');
    });
  });

  describe('extractSenderName', () => {
    it('returns pushName from _data when present', () => {
      expect(service.extractSenderName({ _data: { pushName: 'Bob' } })).toBe('Bob');
    });

    it('falls back to payload-level pushName', () => {
      expect(service.extractSenderName({ pushName: 'Alice' })).toBe('Alice');
    });

    it('returns undefined when no candidate is a non-empty string', () => {
      expect(service.extractSenderName({})).toBeUndefined();
      expect(service.extractSenderName(null)).toBeUndefined();
    });
  });

  describe('resolvePreferredChatId', () => {
    it('prefers remoteJidAlt over remoteJid in _data.key', () => {
      expect(
        service.resolvePreferredChatId({
          _data: { key: { remoteJidAlt: '5511@s.whatsapp.net', remoteJid: 'fallback@s.whatsapp.net' } },
        }),
      ).toBe('5511@s.whatsapp.net');
    });

    it('returns null when no candidates', () => {
      expect(service.resolvePreferredChatId({})).toBeNull();
    });

    it('avoids @lid candidates when alternatives exist', () => {
      expect(
        service.resolvePreferredChatId({
          chatId: '12345@lid',
          from: '5511999991234@s.whatsapp.net',
        }),
      ).toBe('5511999991234@s.whatsapp.net');
    });
  });

  describe('isRemoteChatAwaitingReply', () => {
    it('returns true when lastMessageFromMe is false (customer sent last)', () => {
      expect(
        service.isRemoteChatAwaitingReply({ id: 'a', lastMessageFromMe: false } as never),
      ).toBe(true);
    });

    it('returns false when we sent last', () => {
      expect(
        service.isRemoteChatAwaitingReply({ id: 'a', lastMessageFromMe: true } as never),
      ).toBe(false);
    });
  });

  describe('toInboundMessage', () => {
    it('returns null when id or from is missing', () => {
      expect(service.toInboundMessage('ws-1', { id: '', from: 'x' } as never)).toBeNull();
      expect(service.toInboundMessage('ws-1', { id: 'x', from: '' } as never)).toBeNull();
    });

    it('builds an InboundMessage with provider=meta-cloud by default', () => {
      const result = service.toInboundMessage('ws-1', {
        id: 'm1',
        from: '5511999991234@c.us',
        to: 'me',
        body: 'hi',
        type: 'chat',
        timestamp: 1_700_000_000_000,
      } as never);
      expect(result).toEqual(
        expect.objectContaining({
          workspaceId: 'ws-1',
          provider: 'meta-cloud',
          ingestMode: 'catchup',
          providerMessageId: 'm1',
          type: 'text',
        }),
      );
    });
  });

  describe('resolveBackfillCursor', () => {
    it('returns null when no backfillCursor present', () => {
      expect(service.resolveBackfillCursor({})).toBeNull();
    });

    it('returns null when chatId or activityTimestamp missing', () => {
      expect(
        service.resolveBackfillCursor({ backfillCursor: { chatId: '', activityTimestamp: 1 } }),
      ).toBeNull();
      expect(
        service.resolveBackfillCursor({ backfillCursor: { chatId: 'x', activityTimestamp: 0 } }),
      ).toBeNull();
    });

    it('returns normalized cursor when fields are present', () => {
      const cursor = service.resolveBackfillCursor({
        backfillCursor: { chatId: 'c1', activityTimestamp: 1_700_000_000_000 },
      });
      expect(cursor).toEqual({
        chatId: 'c1',
        activityTimestamp: 1_700_000_000_000,
        updatedAt: expect.any(String),
      });
    });
  });
});
