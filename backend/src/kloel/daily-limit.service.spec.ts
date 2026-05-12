import { Test } from '@nestjs/testing';
import { DailyLimitService } from './daily-limit.service';
import { PrismaService } from '../prisma/prisma.service';

describe('DailyLimitService', () => {
  let service: DailyLimitService;
  let prisma: {
    channelConfig: { findUnique: jest.Mock };
    dailyLimitCounter: { upsert: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      channelConfig: { findUnique: jest.fn() },
      dailyLimitCounter: { upsert: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [DailyLimitService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(DailyLimitService);
  });

  describe('isReply', () => {
    it('returns true when outboundKind is reply', async () => {
      await expect(service.isReply({ outboundKind: 'reply' })).resolves.toBe(true);
    });

    it('returns true when outboundKind is inbound-reply', async () => {
      await expect(service.isReply({ outboundKind: 'inbound-reply' })).resolves.toBe(true);
    });

    it('returns false when outboundKind is proactive', async () => {
      await expect(service.isReply({ outboundKind: 'proactive' })).resolves.toBe(false);
    });

    it('returns false when outboundKind is missing', async () => {
      await expect(service.isReply({})).resolves.toBe(false);
    });

    it('returns false when context is nullish', async () => {
      await expect(service.isReply(undefined)).resolves.toBe(false);
    });
  });

  describe('ensureProactiveDailyLimit', () => {
    const wsId = 'ws-1';
    const ch = 'whatsapp';

    it('allows send when under cap', async () => {
      prisma.channelConfig.findUnique.mockResolvedValue({ dailyMessageLimit: 25 });
      prisma.dailyLimitCounter.upsert.mockResolvedValue({ used: 5, capAtDay: 25 });

      const result = await service.ensureProactiveDailyLimit(wsId, ch);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(20);
      expect(result.capAtDay).toBe(25);
    });

    it('blocks send when exactly at cap (used > cap)', async () => {
      prisma.channelConfig.findUnique.mockResolvedValue({ dailyMessageLimit: 25 });
      prisma.dailyLimitCounter.upsert.mockResolvedValue({ used: 26, capAtDay: 25 });

      const result = await service.ensureProactiveDailyLimit(wsId, ch);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(prisma.dailyLimitCounter.upsert).toHaveBeenCalled();
    });

    it('blocks send when over cap', async () => {
      prisma.channelConfig.findUnique.mockResolvedValue({ dailyMessageLimit: 10 });
      prisma.dailyLimitCounter.upsert.mockResolvedValue({ used: 11, capAtDay: 10 });

      const result = await service.ensureProactiveDailyLimit(wsId, ch);
      expect(result.allowed).toBe(false);
    });

    it('uses default cap 25 when no config exists', async () => {
      prisma.channelConfig.findUnique.mockResolvedValue(null);
      prisma.dailyLimitCounter.upsert.mockResolvedValue({ used: 3, capAtDay: 25 });

      const result = await service.ensureProactiveDailyLimit(wsId, ch);
      expect(result.allowed).toBe(true);
      expect(result.capAtDay).toBe(25);
    });

    it('passes day as Date in upsert call', async () => {
      prisma.channelConfig.findUnique.mockResolvedValue({ dailyMessageLimit: 5 });
      prisma.dailyLimitCounter.upsert.mockResolvedValue({ used: 2, capAtDay: 5 });

      await service.ensureProactiveDailyLimit(wsId, ch);
      const callArgs = prisma.dailyLimitCounter.upsert.mock.calls[0][0];
      expect(callArgs.where).toEqual({
        workspaceId_channel_day: {
          workspaceId: wsId,
          channel: ch,
          day: expect.any(Date),
        },
      });
      expect(callArgs.create).toMatchObject({
        workspaceId: wsId,
        channel: ch,
        day: expect.any(Date),
        used: 1,
        capAtDay: 5,
      });
    });

    it('falls back to allowed=true on DB error', async () => {
      prisma.channelConfig.findUnique.mockResolvedValue({ dailyMessageLimit: 25 });
      prisma.dailyLimitCounter.upsert.mockRejectedValue(new Error('db down'));

      const result = await service.ensureProactiveDailyLimit(wsId, ch);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(-1);
    });

    it('normalizes channel name to lowercase', async () => {
      prisma.channelConfig.findUnique.mockResolvedValue({ dailyMessageLimit: 10 });
      prisma.dailyLimitCounter.upsert.mockResolvedValue({ used: 1, capAtDay: 10 });

      await service.ensureProactiveDailyLimit(wsId, 'WHATSAPP');
      const callArgs = prisma.dailyLimitCounter.upsert.mock.calls[0][0];
      expect(callArgs.where.workspaceId_channel_day.channel).toBe('whatsapp');
    });
  });
});
