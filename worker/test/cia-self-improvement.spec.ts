import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import {
  computeLearningSnapshot,
  pickVariant,
  recordDecisionLog,
  updateVariantOutcome,
} from '../processors/cia/self-improvement';

function prismaClientMock(client: { kloelMemory: unknown; mindBanditArm?: unknown }): PrismaClient {
  return client as PrismaClient;
}

describe('cia-self-improvement', () => {
  it('picks the best stored variant while still supporting exploration defaults', async () => {
    const prisma = {
      mindBanditArm: {
        findMany: vi.fn(async () => [
          {
            alpha: 8,
            arm: 'followup:proof',
            beta: 1,
            context: {
              text: 'variante melhor',
            },
            id: 'arm-1',
            pulls: 2,
          },
        ]),
        updateMany: vi.fn(async () => ({ count: 1 })),
        upsert: vi.fn(async () => ({})),
      },
      kloelMemory: {},
    };

    const variant = await pickVariant(prismaClientMock(prisma), 'ws-1', 'followup');

    expect(variant.text).toBe('variante melhor');
    expect(variant.uses).toBe(2);
  });

  it('records decision logs and updates variant scores from outcomes', async () => {
    const create = vi.fn(async () => ({}));
    const update = vi.fn(async () => ({}));
    const upsertArm = vi.fn(async () => ({}));

    const prisma = {
      kloelMemory: {
        create,
      },
      mindBanditArm: {
        update,
        upsert: upsertArm,
      },
    };

    const prismaClient = prismaClientMock(prisma);

    await recordDecisionLog(prismaClient, {
      workspaceId: 'ws-1',
      contactId: 'contact-1',
      variantKey: 'payment:pix_recovery',
      intent: 'PAYMENT_RECOVERY',
      message: 'texto',
      outcome: 'SENT',
      priority: 0.9,
    });

    await updateVariantOutcome(prismaClient, {
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
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          alpha: { increment: 1 },
          beta: { increment: 0 },
        }),
      }),
    );
  });

  it('builds a learning snapshot from recent decision logs', async () => {
    const prisma = {
      kloelMemory: {
        findMany: vi.fn(async () => [
          { value: { variantKey: 'followup:direct', outcome: 'SENT' } },
          { value: { variantKey: 'followup:direct', outcome: 'SOLD' } },
          { value: { variantKey: 'followup:proof', outcome: 'FAILED' } },
        ]),
      },
    };

    const snapshot = await computeLearningSnapshot(prismaClientMock(prisma), 'ws-1');

    expect(snapshot.totalLogs).toBe(3);
    expect(snapshot.soldCount).toBe(1);
    expect(snapshot.failedCount).toBe(1);
    expect(snapshot.topVariantKey).toBe('followup:direct');
  });
});
