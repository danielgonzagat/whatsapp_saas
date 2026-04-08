import { describe, expect, it, vi } from 'vitest';
import {
  computeLearningSnapshot,
  pickVariant,
  recordDecisionLog,
  updateVariantOutcome,
} from '../processors/cia/self-improvement';

describe('cia-self-improvement', () => {
  it('picks the best stored variant while still supporting exploration defaults', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const prisma: any = {
      kloelMemory: {
        findMany: vi.fn(async () => [
          {
            value: {
              key: 'followup:proof',
              text: 'variante melhor',
              score: 8,
              uses: 2,
            },
          },
        ]),
      },
    };

    const variant = await pickVariant(prisma, 'ws-1', 'followup');

    expect(variant.text).toBe('variante melhor');
    expect(variant.score).toBe(8);
    randomSpy.mockRestore();
  });

  it('records decision logs and updates variant scores from outcomes', async () => {
    const create = vi.fn(async () => ({}));
    const upsert = vi.fn(async () => ({}));
    const findUnique = vi.fn(async () => null);

    const prisma: any = {
      kloelMemory: {
        create,
        upsert,
        findUnique,
      },
    };

    await recordDecisionLog(prisma, {
      workspaceId: 'ws-1',
      contactId: 'contact-1',
      variantKey: 'payment:pix_recovery',
      intent: 'PAYMENT_RECOVERY',
      message: 'texto',
      outcome: 'SENT',
      priority: 0.9,
    });

    await updateVariantOutcome(prisma, {
      workspaceId: 'ws-1',
      family: 'payment_recovery',
      variant: {
        key: 'payment:pix_recovery',
        family: 'payment_recovery',
        text: 'texto',
        score: 1,
        uses: 0,
      },
      outcome: 'SOLD',
      revenue: 397,
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          category: 'decision_log',
        }),
      }),
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          category: 'cia_variant',
        }),
      }),
    );
  });

  it('builds a learning snapshot from recent decision logs', async () => {
    const prisma: any = {
      kloelMemory: {
        findMany: vi.fn(async () => [
          { value: { variantKey: 'followup:direct', outcome: 'SENT' } },
          { value: { variantKey: 'followup:direct', outcome: 'SOLD' } },
          { value: { variantKey: 'followup:proof', outcome: 'FAILED' } },
        ]),
      },
    };

    const snapshot = await computeLearningSnapshot(prisma, 'ws-1');

    expect(snapshot.totalLogs).toBe(3);
    expect(snapshot.soldCount).toBe(1);
    expect(snapshot.failedCount).toBe(1);
    expect(snapshot.topVariantKey).toBe('followup:direct');
  });
});
