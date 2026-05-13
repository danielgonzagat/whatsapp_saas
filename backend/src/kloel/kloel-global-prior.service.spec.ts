import { KloelGlobalPriorService } from './kloel-global-prior.service';

describe('KloelGlobalPriorService', () => {
  describe('getPrior', () => {
    it('returns null when no prior row exists', async () => {
      const prisma = {
        kloelGlobalPrior: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      };
      const service = new KloelGlobalPriorService(prisma as never);

      const result = await service.getPrior('whatsapp', 'tom', 'FRIENDLY');

      expect(result).toBeNull();
    });

    it('returns Beta posterior mean (successes+1)/(observations+2)', async () => {
      const prisma = {
        kloelGlobalPrior: {
          findUnique: jest.fn().mockResolvedValue({
            observations: 100,
            successes: 70,
          }),
        },
      };
      const service = new KloelGlobalPriorService(prisma as never);

      const result = await service.getPrior('whatsapp', 'tom', 'FRIENDLY');

      expect(result).not.toBeNull();
      expect(result!.observations).toBe(100);
      expect(result!.mean).toBeCloseTo(71 / 102);
    });

    it('returns mean=0.5 for zero observations with zero successes', async () => {
      const prisma = {
        kloelGlobalPrior: {
          findUnique: jest.fn().mockResolvedValue({
            observations: 0,
            successes: 0,
          }),
        },
      };
      const service = new KloelGlobalPriorService(prisma as never);

      const result = await service.getPrior('email', 'message_format', 'html_rich');

      expect(result).not.toBeNull();
      expect(result!.mean).toBeCloseTo(0.5);
    });
  });

  describe('recordObservation', () => {
    it('upserts a new row on first observation', async () => {
      const upsert = jest.fn().mockResolvedValue(undefined);
      const prisma = { kloelGlobalPrior: { upsert } };
      const service = new KloelGlobalPriorService(prisma as never);

      await service.recordObservation('whatsapp', 'tom', 'DIRECT', true);

      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { channel_decisionType_action: { channel: 'whatsapp', decisionType: 'tom', action: 'DIRECT' } },
          create: expect.objectContaining({ observations: 1, successes: 1 }),
          update: expect.objectContaining({ observations: { increment: 1 }, successes: { increment: 1 } }),
        }),
      );
    });

    it('increments observations but not successes on failure', async () => {
      const upsert = jest.fn().mockResolvedValue(undefined);
      const prisma = { kloelGlobalPrior: { upsert } };
      const service = new KloelGlobalPriorService(prisma as never);

      await service.recordObservation('instagram', 'audio_vs_text', 'text', false);

      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { channel_decisionType_action: { channel: 'instagram', decisionType: 'audio_vs_text', action: 'text' } },
          create: expect.objectContaining({ observations: 1, successes: 0 }),
          update: expect.objectContaining({ observations: { increment: 1 } }),
        }),
      );
    });
  });
});
