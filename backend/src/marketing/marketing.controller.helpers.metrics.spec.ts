import {
  buildChannelMetrics,
  computeAverageFirstReplyMs,
  computeResponseStats,
  distinctConversationIds,
  formatAvgResponseTime,
  MARKETING_CHANNELS,
  minInboundCreatedAt,
} from './marketing.controller.helpers';

describe('marketing.controller.helpers (channel metrics + response stats)', () => {
  describe('MARKETING_CHANNELS', () => {
    it('exposes the five marketing channels in canonical order', () => {
      expect(MARKETING_CHANNELS).toEqual([
        'WHATSAPP',
        'INSTAGRAM',
        'MESSENGER',
        'EMAIL',
        'TIKTOK',
      ]);
    });
  });

  describe('buildChannelMetrics', () => {
    it('returns a setup row with zeroed counts when no data exists', () => {
      const result = buildChannelMetrics({
        conversationGroups: [],
        messageGroups: [],
        conversationRows: [],
      });

      expect(Object.keys(result)).toEqual([...MARKETING_CHANNELS]);
      for (const channel of MARKETING_CHANNELS) {
        expect(result[channel]).toEqual({
          status: 'setup',
          messages: 0,
          leads: 0,
          sales: 0,
        });
      }
    });

    it('aggregates leads from conversation groups and messages from message groups', () => {
      const result = buildChannelMetrics({
        conversationGroups: [
          { channel: 'WHATSAPP', _count: { id: 12 } },
          { channel: 'EMAIL', _count: { id: 3 } },
        ],
        messageGroups: [
          { conversationId: 'c-wa-1', _count: { id: 5 } },
          { conversationId: 'c-wa-2', _count: { id: 2 } },
          { conversationId: 'c-em-1', _count: { id: 7 } },
        ],
        conversationRows: [
          { id: 'c-wa-1', channel: 'WHATSAPP' },
          { id: 'c-wa-2', channel: 'WHATSAPP' },
          { id: 'c-em-1', channel: 'EMAIL' },
        ],
      });

      expect(result.WHATSAPP).toEqual({
        status: 'live',
        messages: 7,
        leads: 12,
        sales: 0,
      });
      expect(result.EMAIL).toEqual({
        status: 'live',
        messages: 7,
        leads: 3,
        sales: 0,
      });
      expect(result.INSTAGRAM).toEqual({
        status: 'setup',
        messages: 0,
        leads: 0,
        sales: 0,
      });
    });

    it('ignores message groups with null conversationId or unknown conversation', () => {
      const result = buildChannelMetrics({
        conversationGroups: [],
        messageGroups: [
          { conversationId: null, _count: { id: 99 } },
          { conversationId: 'orphan', _count: { id: 99 } },
          { conversationId: 'c-wa-1', _count: { id: 4 } },
        ],
        conversationRows: [{ id: 'c-wa-1', channel: 'WHATSAPP' }],
      });

      expect(result.WHATSAPP.messages).toBe(4);
      expect(result.INSTAGRAM.messages).toBe(0);
    });

    it('emits status=live as soon as a single message is counted', () => {
      const result = buildChannelMetrics({
        conversationGroups: [],
        messageGroups: [{ conversationId: 'c-ti-1', _count: { id: 1 } }],
        conversationRows: [{ id: 'c-ti-1', channel: 'TIKTOK' }],
      });

      expect(result.TIKTOK.status).toBe('live');
      expect(result.TIKTOK.messages).toBe(1);
    });
  });

  describe('computeResponseStats', () => {
    it('returns 0/0 when there is no traffic', () => {
      expect(
        computeResponseStats({
          outboundMessages: 0,
          inboundMessages: 0,
          totalConversations: 0,
          convertedConversations: 0,
        }),
      ).toEqual({ responseRate: 0, conversionRate: 0 });
    });

    it('rounds the response rate to the nearest integer', () => {
      expect(
        computeResponseStats({
          outboundMessages: 8,
          inboundMessages: 3,
          totalConversations: 0,
          convertedConversations: 0,
        }),
      ).toEqual({ responseRate: 38, conversionRate: 0 });
    });

    it('rounds the conversion rate to the nearest integer', () => {
      expect(
        computeResponseStats({
          outboundMessages: 0,
          inboundMessages: 0,
          totalConversations: 7,
          convertedConversations: 2,
        }),
      ).toEqual({ responseRate: 0, conversionRate: 29 });
    });

    it('handles a 100% conversion + 100% response cleanly', () => {
      expect(
        computeResponseStats({
          outboundMessages: 5,
          inboundMessages: 5,
          totalConversations: 10,
          convertedConversations: 10,
        }),
      ).toEqual({ responseRate: 100, conversionRate: 100 });
    });
  });

  describe('computeAverageFirstReplyMs', () => {
    const inboundT0 = new Date('2026-05-28T10:00:00Z');
    const inboundT1 = new Date('2026-05-28T10:01:00Z');

    it('returns null when inbound sample is empty', () => {
      expect(
        computeAverageFirstReplyMs({
          inbound: [],
          outbound: [
            { conversationId: 'c-1', createdAt: new Date('2026-05-28T10:01:00Z') },
          ],
        }),
      ).toBeNull();
    });

    it('returns null when there is no outbound reply after an inbound message', () => {
      expect(
        computeAverageFirstReplyMs({
          inbound: [{ conversationId: 'c-1', createdAt: inboundT0 }],
          outbound: [
            // outbound BEFORE inbound — must not count
            {
              conversationId: 'c-1',
              createdAt: new Date('2026-05-28T09:59:00Z'),
            },
          ],
        }),
      ).toBeNull();
    });

    it('averages the latency between each inbound and its first matching outbound reply', () => {
      const result = computeAverageFirstReplyMs({
        inbound: [
          { conversationId: 'c-1', createdAt: inboundT0 },
          { conversationId: 'c-2', createdAt: inboundT1 },
        ],
        outbound: [
          // c-1 first reply 30s later, second reply must be ignored
          {
            conversationId: 'c-1',
            createdAt: new Date('2026-05-28T10:00:30Z'),
          },
          {
            conversationId: 'c-1',
            createdAt: new Date('2026-05-28T10:05:00Z'),
          },
          // c-2 first reply 90s later
          {
            conversationId: 'c-2',
            createdAt: new Date('2026-05-28T10:02:30Z'),
          },
        ],
      });

      // (30_000 + 90_000) / 2 = 60_000
      expect(result).toBe(60_000);
    });

    it('skips inbound messages without a conversationId', () => {
      const result = computeAverageFirstReplyMs({
        inbound: [
          { conversationId: null, createdAt: inboundT0 },
          { conversationId: 'c-2', createdAt: inboundT1 },
        ],
        outbound: [
          {
            conversationId: 'c-2',
            createdAt: new Date('2026-05-28T10:02:00Z'),
          },
        ],
      });

      // Only c-2 counts: 60_000ms.
      expect(result).toBe(60_000);
    });

    it('skips outbound messages without a conversationId', () => {
      const result = computeAverageFirstReplyMs({
        inbound: [{ conversationId: 'c-1', createdAt: inboundT0 }],
        outbound: [
          { conversationId: null, createdAt: new Date('2026-05-28T10:00:30Z') },
          {
            conversationId: 'c-1',
            createdAt: new Date('2026-05-28T10:00:45Z'),
          },
        ],
      });

      expect(result).toBe(45_000);
    });
  });

  describe('formatAvgResponseTime', () => {
    it('returns -- for null', () => {
      expect(formatAvgResponseTime(null)).toBe('--');
    });

    it('formats sub-minute values with one decimal in seconds', () => {
      expect(formatAvgResponseTime(0)).toBe('0.0s');
      expect(formatAvgResponseTime(1_234)).toBe('1.2s');
      expect(formatAvgResponseTime(59_999)).toBe('60.0s');
    });

    it('formats minute-or-greater values rounded in minutes', () => {
      expect(formatAvgResponseTime(60_000)).toBe('1m');
      expect(formatAvgResponseTime(90_000)).toBe('2m');
      expect(formatAvgResponseTime(125_000)).toBe('2m');
      expect(formatAvgResponseTime(150_000)).toBe('3m');
    });
  });

  describe('minInboundCreatedAt', () => {
    it('returns null for an empty array', () => {
      expect(minInboundCreatedAt([])).toBeNull();
    });

    it('returns the earliest createdAt regardless of input order', () => {
      const a = new Date('2026-05-28T10:00:00Z');
      const b = new Date('2026-05-28T10:00:01Z');
      const c = new Date('2026-05-28T09:59:00Z');
      expect(
        minInboundCreatedAt([
          { conversationId: 'x', createdAt: a },
          { conversationId: 'y', createdAt: b },
          { conversationId: 'z', createdAt: c },
        ]),
      ).toBe(c);
    });
  });

  describe('distinctConversationIds', () => {
    it('returns an empty array for an empty input', () => {
      expect(distinctConversationIds([])).toEqual([]);
    });

    it('removes duplicates and skips nulls while preserving first-seen order', () => {
      const now = new Date();
      const result = distinctConversationIds([
        { conversationId: 'c-1', createdAt: now },
        { conversationId: null, createdAt: now },
        { conversationId: 'c-2', createdAt: now },
        { conversationId: 'c-1', createdAt: now },
        { conversationId: 'c-3', createdAt: now },
        { conversationId: null, createdAt: now },
      ]);
      expect(result).toEqual(['c-1', 'c-2', 'c-3']);
    });
  });
});
