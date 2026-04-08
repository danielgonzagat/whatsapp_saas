import { describe, expect, it, vi } from 'vitest';
import {
  buildSeedCognitiveState,
  persistCustomerCognitiveState,
} from '../processors/cia/cognitive-state';

describe('cia-cognitive-state', () => {
  it('preserves objections and advances the next best action with new buying signals', () => {
    const initial = buildSeedCognitiveState({
      contactId: 'contact-1',
      phone: '5511999999999',
      lastMessageText: 'achei caro e queria entender se funciona mesmo',
      unreadCount: 1,
      lastMessageAt: new Date('2026-03-19T10:00:00.000Z'),
      leadScore: 58,
    });

    const evolved = buildSeedCognitiveState({
      contactId: 'contact-1',
      phone: '5511999999999',
      lastMessageText: 'se eu fechar hoje você me manda o link?',
      unreadCount: 1,
      lastMessageAt: new Date('2026-03-19T10:05:00.000Z'),
      leadScore: 84,
      previousState: initial,
    });

    expect(initial.objections).toContain('price');
    expect(initial.objections).toContain('trust');
    expect(evolved.objections).toContain('price');
    expect(evolved.paymentState).not.toBe('NONE');
    expect(['PAYMENT_RECOVERY', 'OFFER']).toContain(evolved.nextBestAction);
  });

  it('persists cognitive state and projects it to contact fields', async () => {
    const upsert = vi.fn(async () => ({}));
    const create = vi.fn(async () => ({}));
    const findUnique = vi.fn(async () => null);
    const update = vi.fn(async () => ({}));

    const prisma: any = {
      kloelMemory: {
        upsert,
        create,
        findUnique,
      },
      contact: {
        update,
      },
    };

    const state = buildSeedCognitiveState({
      conversationId: 'conv-1',
      contactId: 'contact-1',
      phone: '5511999999999',
      lastMessageText: 'quero entender como fechar hoje',
      unreadCount: 2,
      lastMessageAt: new Date('2026-03-19T10:00:00.000Z'),
      leadScore: 88,
    });

    await persistCustomerCognitiveState(prisma, {
      workspaceId: 'ws-1',
      conversationId: 'conv-1',
      contactId: 'contact-1',
      phone: '5511999999999',
      contactName: 'João',
      state,
      source: 'test',
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          category: 'cognitive_state',
        }),
      }),
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          category: 'cognitive_delta',
        }),
      }),
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nextBestAction: state.nextBestAction,
          aiSummary: state.summary,
        }),
      }),
    );
  });
});
