import { Test, TestingModule } from '@nestjs/testing';
import { CiaSendHelpersService } from './cia-send-helpers.service';
import { AgentEventsService } from '../whatsapp/agent-events.service';
import { ChannelTransportRegistry } from '../kloel/channel-transport.registry';
import { OpsAlertService } from '../observability/ops-alert.service';

const REDIS_TOKEN = 'default_IORedisModuleConnectionToken';

describe('CiaSendHelpersService', () => {
  let service: CiaSendHelpersService;
  let redis: {
    set: jest.Mock;
    del: jest.Mock;
    incr: jest.Mock;
    decr: jest.Mock;
    expire: jest.Mock;
  };
  let agentEvents: { publish: jest.Mock };
  let transports: { send: jest.Mock };

  beforeEach(async () => {
    redis = {
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(0),
      incr: jest.fn().mockResolvedValue(1),
      decr: jest.fn().mockResolvedValue(0),
      expire: jest.fn().mockResolvedValue(1),
    };
    agentEvents = { publish: jest.fn().mockResolvedValue(undefined) };
    transports = { send: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CiaSendHelpersService,
        { provide: REDIS_TOKEN, useValue: redis },
        { provide: AgentEventsService, useValue: agentEvents },
        { provide: ChannelTransportRegistry, useValue: transports },
        { provide: OpsAlertService, useValue: { alertOnCriticalError: jest.fn() } },
      ],
    }).compile();
    service = module.get(CiaSendHelpersService);
  });

  describe('getSharedReplyLockKey', () => {
    it('keys by workspace + contactId when present', () => {
      expect(service.getSharedReplyLockKey('ws-1', 'c-1')).toBe('autopilot:reply:ws-1:c-1');
    });

    it('falls back to normalized phone digits when no contactId', () => {
      expect(service.getSharedReplyLockKey('ws-1', null, '+55 (11) 99999-1234')).toBe(
        'autopilot:reply:ws-1:5511999991234',
      );
    });
  });

  describe('redisSetNx', () => {
    it('returns true when Redis SET returns OK', async () => {
      redis.set.mockResolvedValue('OK');
      await expect(service.redisSetNx('k', 'v', 1000)).resolves.toBe(true);
      expect(redis.set).toHaveBeenCalledWith('k', 'v', 'PX', 1000, 'NX');
    });

    it('returns false when SET returns null (already held)', async () => {
      redis.set.mockResolvedValue(null);
      await expect(service.redisSetNx('k', 'v', 1000)).resolves.toBe(false);
    });
  });

  describe('reserveDailyMessageLimit', () => {
    it('returns true when used count under limit', async () => {
      redis.incr.mockResolvedValue(5);
      await expect(service.reserveDailyMessageLimit('ws-1')).resolves.toBe(true);
    });

    it('sets 48h TTL on first increment', async () => {
      redis.incr.mockResolvedValue(1);
      await service.reserveDailyMessageLimit('ws-1');
      expect(redis.expire).toHaveBeenCalledWith(expect.any(String), 60 * 60 * 48);
    });

    it('rolls back and emits error event when limit reached', async () => {
      redis.incr.mockResolvedValue(10000);
      const result = await service.reserveDailyMessageLimit('ws-1');
      expect(result).toBe(false);
      expect(redis.decr).toHaveBeenCalled();
      expect(agentEvents.publish).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', phase: 'daily_message_limit' }),
      );
    });
  });

  describe('hasOutboundAction', () => {
    it('detects actions with sent=true/success=true/messageId in result', () => {
      expect(
        service.hasOutboundAction([{ tool: 'send_message', result: { sent: true } }]),
      ).toBe(true);
      expect(
        service.hasOutboundAction([{ tool: 'send_message', result: { messageId: 'x' } }]),
      ).toBe(true);
      expect(service.hasOutboundAction([{ tool: 'unknown_tool', result: { sent: true } }])).toBe(
        false,
      );
    });

    it('handles undefined actions list', () => {
      expect(service.hasOutboundAction(undefined)).toBe(false);
    });
  });

  describe('buildInlineFallbackReply', () => {
    it('handles price keywords', () => {
      const result = service.buildInlineFallbackReply('quanto custa o produto X?');
      expect(result.toLowerCase()).toMatch(/pre[cç]o|pagamento/);
    });

    it('handles greeting keywords with simple lead-in', () => {
      const result = service.buildInlineFallbackReply('Oi, bom dia!');
      expect(result.toLowerCase()).toContain('oi');
    });

    it('returns a default fallback for arbitrary input', () => {
      const result = service.buildInlineFallbackReply('algo qualquer');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('normalizeRemoteTimestamp', () => {
    it('treats ms when value > 1e12', () => {
      const result = service.normalizeRemoteTimestamp(1_700_000_000_000);
      expect(result).toBe(new Date(1_700_000_000_000).toISOString());
    });

    it('treats seconds when value < 1e12', () => {
      const result = service.normalizeRemoteTimestamp(1_700_000_000);
      expect(result).toBe(new Date(1_700_000_000 * 1000).toISOString());
    });

    it('returns null for null/undefined/invalid', () => {
      expect(service.normalizeRemoteTimestamp(null)).toBeNull();
      expect(service.normalizeRemoteTimestamp(undefined)).toBeNull();
      expect(service.normalizeRemoteTimestamp('not-a-date')).toBeNull();
    });
  });

  describe('extractRemoteSenderName', () => {
    it('prefers fallbackName when provided', () => {
      expect(
        service.extractRemoteSenderName({ pushName: 'Alice' }, 'Real Name'),
      ).toBe('Real Name');
    });

    it('falls back to payload _data.pushName', () => {
      expect(
        service.extractRemoteSenderName({ _data: { pushName: 'Bob' } } as never),
      ).toBe('Bob');
    });

    it('returns null when nothing usable', () => {
      expect(service.extractRemoteSenderName({})).toBeNull();
      expect(service.extractRemoteSenderName(null)).toBeNull();
    });
  });

  describe('sendCiaMessageWithDailyLimit', () => {
    it('returns CIA_DAILY_MESSAGE_LIMIT_REACHED when reservation fails', async () => {
      redis.incr.mockResolvedValue(99999);
      const result = await service.sendCiaMessageWithDailyLimit('ws-1', '+5511', 'hi', {});
      expect(result.error).toBe(true);
      expect(result.message).toBe('CIA_DAILY_MESSAGE_LIMIT_REACHED');
      expect(transports.send).not.toHaveBeenCalled();
    });

    it('returns success=true when transport reports success', async () => {
      transports.send.mockResolvedValue({ success: true, messageId: 'msg-1' });
      const result = await service.sendCiaMessageWithDailyLimit('ws-1', '+5511', 'hi', {});
      expect(result.success).toBe(true);
      expect(result.messageId).toBe('msg-1');
    });

    it('releases daily limit when transport fails', async () => {
      transports.send.mockResolvedValue({ success: false, error: 'down' });
      await service.sendCiaMessageWithDailyLimit('ws-1', '+5511', 'hi', {});
      expect(redis.decr).toHaveBeenCalled();
    });
  });

  describe('buildRemoteHistorySummary', () => {
    it('caps history at 20 most recent and labels roles', () => {
      const messages = Array.from({ length: 30 }, (_, i) => ({
        fromMe: i % 2 === 0,
        content: `msg-${i}`,
        createdAt: null,
      }));
      const summary = service.buildRemoteHistorySummary(messages);
      const lines = summary.split('\n');
      expect(lines.length).toBe(20);
      expect(lines.some((l) => l.startsWith('vendedora:'))).toBe(true);
      expect(lines.some((l) => l.startsWith('cliente:'))).toBe(true);
    });

    it('skips messages with empty content', () => {
      const summary = service.buildRemoteHistorySummary([
        { fromMe: false, content: '' },
        { fromMe: false, content: '  ' },
        { fromMe: true, content: 'real' },
      ]);
      expect(summary).toBe('vendedora: real');
    });
  });
});
