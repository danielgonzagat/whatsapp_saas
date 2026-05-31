import { buildRecallDirective } from './kloel-reply-engine.recall.helpers';
import type { LongTermMemoryService } from './mind/memory/long-term-memory.service';
import { matchInstance } from '../../test/helpers/match-instance';

type RecalledFact = Awaited<ReturnType<LongTermMemoryService['recallRelevant']>>[number];

function makeLtm(result: RecalledFact[] | Error): {
  service: LongTermMemoryService;
  calls: unknown[][];
} {
  const calls: unknown[][] = [];
  const service = {
    recallRelevant: jest.fn(async (...args: unknown[]) => {
      calls.push(args);
      if (result instanceof Error) {
        throw result;
      }
      return result;
    }),
  } as unknown as LongTermMemoryService;
  return { service, calls };
}

describe('kloel-reply-engine recall helpers', () => {
  describe('buildRecallDirective', () => {
    it('returns null when the LTM service is missing', async () => {
      const out = await buildRecallDirective(undefined, { workspaceId: 'ws-1' });
      expect(out).toBeNull();
    });

    it('returns null when no workspaceId is provided', async () => {
      const { service, calls } = makeLtm([]);
      const out = await buildRecallDirective(service, { workspaceId: undefined });
      expect(out).toBeNull();
      expect(calls).toHaveLength(0);
    });

    it('returns null when there are no durable facts yet', async () => {
      const { service } = makeLtm([]);
      const out = await buildRecallDirective(service, { workspaceId: 'ws-1' });
      expect(out).toBeNull();
    });

    it('builds a directive from recalled facts and queries the workspace', async () => {
      const { service, calls } = makeLtm([
        { fact: 'checkout.paid', valence: 'positive', strength: 9, occurrences: 4 },
        { fact: 'checkout.abandoned', valence: 'negative', strength: 5, occurrences: 2 },
      ]);

      const out = await buildRecallDirective(service, { workspaceId: 'ws-1' });

      expect(out).not.toBeNull();
      expect(out!.factCount).toBe(2);
      // recallRelevant was queried with the workspace + a bounded limit.
      expect(calls).toHaveLength(1);
      expect(calls[0]![0]).toBe('ws-1');
      expect(calls[0]![1]).toEqual(expect.objectContaining({ limit: matchInstance(Number) }));
      // The directive carries both the positive and the negative tendency.
      expect(out!.directive).toContain('MEMÓRIA DURÁVEL');
      expect(out!.directive).toContain('checkout.paid');
      expect(out!.directive).toContain('tende a dar certo');
      expect(out!.directive).toContain('checkout.abandoned');
      expect(out!.directive).toContain('tende a não dar certo');
      expect(out!.directive).toContain('reforçado 4x');
    });

    it('honors an explicit recall limit', async () => {
      const { service, calls } = makeLtm([
        { fact: 'a', valence: 'positive', strength: 1, occurrences: 1 },
      ]);
      await buildRecallDirective(service, { workspaceId: 'ws-1', limit: 3 });
      expect(calls[0]![1]).toEqual(expect.objectContaining({ limit: 3 }));
    });

    it('is fail-open: returns null and logs when recallRelevant throws', async () => {
      const { service } = makeLtm(new Error('db down'));
      const warn = jest.fn();
      const out = await buildRecallDirective(service, {
        workspaceId: 'ws-1',
        logger: { warn },
      });
      expect(out).toBeNull();
      expect(warn).toHaveBeenCalledWith(
        'kloel_recall_directive_failed',
        expect.objectContaining({ error: 'db down' }),
      );
    });
  });
});
