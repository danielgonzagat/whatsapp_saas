import { LongTermMemoryService } from './long-term-memory.service';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { SpineEventEnvelope } from '../../spine/spine-event.types';

interface GraphNodeRow {
  id: string;
  workspaceId: string;
  kind: string;
  label: string;
  weight: number;
  metadata: Record<string, unknown>;
}

/**
 * Minimal in-memory fake of the slice of PrismaService.mindGraphNode the
 * LongTermMemoryService touches. Models the @@unique([workspaceId,kind,label])
 * upsert key so reinforce-on-repeat collides correctly.
 */
function makePrisma(seed: GraphNodeRow[] = []) {
  const rows: GraphNodeRow[] = seed.map((r) => ({ ...r, metadata: { ...r.metadata } }));

  const findKey = (where: {
    workspaceId_kind_label: { workspaceId: string; kind: string; label: string };
  }) => {
    const k = where.workspaceId_kind_label;
    return (
      rows.find(
        (r) => r.workspaceId === k.workspaceId && r.kind === k.kind && r.label === k.label,
      ) ?? null
    );
  };

  const mindGraphNode = {
    findUnique: jest.fn(
      async ({
        where,
      }: {
        where: { workspaceId_kind_label: { workspaceId: string; kind: string; label: string } };
      }) => findKey(where),
    ),
    create: jest.fn(async ({ data }: { data: GraphNodeRow }) => {
      const row: GraphNodeRow = { ...data, metadata: { ...data.metadata } };
      rows.push(row);
      return row;
    }),
    update: jest.fn(
      async ({ where, data }: { where: { id: string }; data: Partial<GraphNodeRow> }) => {
        const row = rows.find((r) => r.id === where.id);
        if (!row) {
          throw new Error('not found');
        }
        if (data.weight !== undefined) {
          row.weight = data.weight;
        }
        if (data.metadata !== undefined) {
          row.metadata = { ...data.metadata };
        }
        return row;
      },
    ),
    updateMany: jest.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string; workspaceId?: string };
        data: Partial<GraphNodeRow>;
      }) => {
        const matched = rows.filter(
          (r) =>
            r.id === where.id &&
            (where.workspaceId === undefined || r.workspaceId === where.workspaceId),
        );
        for (const row of matched) {
          if (data.weight !== undefined) {
            row.weight = data.weight;
          }
          if (data.metadata !== undefined) {
            row.metadata = { ...data.metadata };
          }
        }
        return { count: matched.length };
      },
    ),
    findMany: jest.fn(
      async ({ where, take }: { where: { workspaceId: string; kind: string }; take: number }) =>
        rows
          .filter((r) => r.workspaceId === where.workspaceId && r.kind === where.kind)
          .sort((a, b) => b.weight - a.weight)
          .slice(0, take),
    ),
  };

  return { prisma: { mindGraphNode } as unknown as PrismaService, rows };
}

function makeEvent(overrides: Partial<SpineEventEnvelope> = {}): SpineEventEnvelope {
  return {
    eventId: `evt_${Math.random().toString(36).slice(2)}`,
    eventName: 'commerce.payment.approved',
    timestamp: new Date().toISOString(),
    occurredAt: new Date().toISOString(),
    workspaceId: 'ws-1',
    truthMode: 'observed',
    provenance: {
      source: 'production',
      processor: 'test',
      processorVersion: '1.0.0',
      schemaVersion: '1.0',
      environment: 'dev',
    },
    valence: 'positive',
    ...overrides,
  };
}

describe('LongTermMemoryService', () => {
  describe('consolidation (Hebbian reinforce on terminal outcomes)', () => {
    it('creates a durable fact node on first terminal outcome', async () => {
      const { prisma, rows } = makePrisma();
      const svc = new LongTermMemoryService(prisma);

      await svc.handle(makeEvent({ eventName: 'commerce.payment.approved', valence: 'positive' }));

      expect(rows).toHaveLength(1);
      expect(rows[0]!.kind).toBe(LongTermMemoryService.FACT_KIND);
      expect(rows[0]!.label).toBe('commerce.payment.approved');
      expect(rows[0]!.metadata['valence']).toBe('positive');
      expect(rows[0]!.metadata['occurrences']).toBe(1);
    });

    it('reinforces weight and bumps occurrences when the same outcome recurs', async () => {
      const { prisma, rows } = makePrisma();
      const svc = new LongTermMemoryService(prisma);

      await svc.handle(
        makeEvent({ eventId: 'e1', eventName: 'commerce.crm.deal_won', valence: 'positive' }),
      );
      const w1 = rows[0]!.weight;
      await svc.handle(
        makeEvent({ eventId: 'e2', eventName: 'commerce.crm.deal_won', valence: 'positive' }),
      );

      expect(rows).toHaveLength(1); // collides on unique key, not duplicated
      expect(rows[0]!.weight).toBeGreaterThan(w1); // reinforced
      expect(rows[0]!.metadata['occurrences']).toBe(2);
    });

    it('is idempotent — a replayed eventId does not double-reinforce', async () => {
      const { prisma, rows } = makePrisma();
      const svc = new LongTermMemoryService(prisma);

      await svc.handle(
        makeEvent({ eventId: 'dup', eventName: 'commerce.lead.converted', valence: 'positive' }),
      );
      const w1 = rows[0]!.weight;
      await svc.handle(
        makeEvent({ eventId: 'dup', eventName: 'commerce.lead.converted', valence: 'positive' }),
      );

      expect(rows[0]!.weight).toBe(w1);
      expect(rows[0]!.metadata['occurrences']).toBe(1);
    });

    it('decays a stale fact before reinforcing it', async () => {
      const stale: GraphNodeRow = {
        id: 'n1',
        workspaceId: 'ws-1',
        kind: LongTermMemoryService.FACT_KIND,
        label: 'commerce.payment.approved',
        weight: 20,
        // last seen ~60 days ago → multiple half-lives → heavy decay
        metadata: {
          valence: 'positive',
          occurrences: 5,
          lastAt: new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString(),
        },
      };
      const { prisma, rows } = makePrisma([stale]);
      const svc = new LongTermMemoryService(prisma);

      await svc.handle(makeEvent({ eventName: 'commerce.payment.approved', valence: 'positive' }));

      // 20 decayed over ~4 half-lives (≈1.25) + 1 reinforce ≈ ~2.25, far below 20.
      expect(rows[0]!.weight).toBeLessThan(20);
      expect(rows[0]!.metadata['occurrences']).toBe(6);
    });

    it('ignores non-terminal events', async () => {
      const { prisma, rows } = makePrisma();
      const svc = new LongTermMemoryService(prisma);

      await svc.handle(makeEvent({ eventName: 'cognition.analysis_started', valence: 'positive' }));

      expect(rows).toHaveLength(0);
    });

    it('ignores neutral terminal events (no durable learning signal)', async () => {
      const { prisma, rows } = makePrisma();
      const svc = new LongTermMemoryService(prisma);

      await svc.handle(
        makeEvent({
          eventName: 'commerce.post_sale.satisfaction_signal_observed',
          valence: 'neutral',
        }),
      );

      expect(rows).toHaveLength(0);
    });

    it('skips events without a workspaceId', async () => {
      const { prisma, rows } = makePrisma();
      const svc = new LongTermMemoryService(prisma);

      await svc.handle(
        makeEvent({ workspaceId: undefined, eventName: 'commerce.payment.approved' }),
      );

      expect(rows).toHaveLength(0);
    });
  });

  describe('recallRelevant (read path for the reply engine)', () => {
    it('returns the strongest durable facts for a workspace, decayed at read time', async () => {
      const seed: GraphNodeRow[] = [
        {
          id: 'a',
          workspaceId: 'ws-1',
          kind: LongTermMemoryService.FACT_KIND,
          label: 'commerce.payment.approved',
          weight: 10,
          metadata: { valence: 'positive', occurrences: 8, lastAt: new Date().toISOString() },
        },
        {
          id: 'b',
          workspaceId: 'ws-1',
          kind: LongTermMemoryService.FACT_KIND,
          label: 'commerce.payment.declined',
          weight: 3,
          metadata: { valence: 'negative', occurrences: 2, lastAt: new Date().toISOString() },
        },
      ];
      const { prisma } = makePrisma(seed);
      const svc = new LongTermMemoryService(prisma);

      const recalled = await svc.recallRelevant('ws-1');

      expect(recalled).toHaveLength(2);
      expect(recalled[0]!.fact).toBe('commerce.payment.approved');
      expect(recalled[0]!.valence).toBe('positive');
      expect(recalled[0]!.strength).toBeGreaterThan(recalled[1]!.strength);
      expect(recalled[0]!.occurrences).toBe(8);
    });

    it('filters by valence when requested', async () => {
      const seed: GraphNodeRow[] = [
        {
          id: 'a',
          workspaceId: 'ws-1',
          kind: LongTermMemoryService.FACT_KIND,
          label: 'commerce.payment.approved',
          weight: 10,
          metadata: { valence: 'positive', occurrences: 8, lastAt: new Date().toISOString() },
        },
        {
          id: 'b',
          workspaceId: 'ws-1',
          kind: LongTermMemoryService.FACT_KIND,
          label: 'commerce.payment.declined',
          weight: 3,
          metadata: { valence: 'negative', occurrences: 2, lastAt: new Date().toISOString() },
        },
      ];
      const { prisma } = makePrisma(seed);
      const svc = new LongTermMemoryService(prisma);

      const negatives = await svc.recallRelevant('ws-1', { valence: 'negative' });

      expect(negatives).toHaveLength(1);
      expect(negatives[0]!.fact).toBe('commerce.payment.declined');
    });

    it('returns an empty list (never throws) when the store fails', async () => {
      const prisma = {
        mindGraphNode: { findMany: jest.fn(async () => Promise.reject(new Error('db down'))) },
      } as unknown as PrismaService;
      const svc = new LongTermMemoryService(prisma);

      await expect(svc.recallRelevant('ws-1')).resolves.toEqual([]);
    });
  });

  describe('spine wiring', () => {
    it('subscribes to the spine and consolidates emitted terminal outcomes', async () => {
      const { prisma, rows } = makePrisma();
      let handler: ((e: SpineEventEnvelope) => void) | undefined;
      const spine = {
        subscribe: jest.fn((h: (e: SpineEventEnvelope) => void) => {
          handler = h;
          return () => undefined;
        }),
      } as unknown as import('../../spine/spine-emitter.service').SpineEmitterService;

      const svc = new LongTermMemoryService(prisma, spine);
      expect(handler).toBeDefined();

      handler!(makeEvent({ eventName: 'commerce.payment.approved', valence: 'positive' }));
      await new Promise((r) => setImmediate(r)); // let the detached promise settle
      void svc;

      expect(rows).toHaveLength(1);
    });
  });
});
