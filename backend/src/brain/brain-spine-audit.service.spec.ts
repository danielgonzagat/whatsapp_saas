import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { BrainSpineAuditService, SpineAuditResult } from './brain-spine-audit.service';

describe('BrainSpineAuditService', () => {
  let service: BrainSpineAuditService;

  function buildAuditService(queryRawMock: jest.Mock) {
    const prisma = { $queryRawUnsafe: queryRawMock } as unknown as PrismaService;
    return new BrainSpineAuditService(prisma);
  }

  describe('audit(sinceIso)', () => {
    it('returns empty capabilities when no events exist', async () => {
      const mock = jest.fn().mockResolvedValue([]);
      const svc = buildAuditService(mock);

      const result: SpineAuditResult = await svc.audit('2026-01-01T00:00:00.000Z');

      expect(result.capabilities).toEqual([]);
      expect(result.totalMismatch).toBe(0);
      expect(result.windowFrom).toBe('2026-01-01T00:00:00.000Z');
      expect(result.windowTo).toBeDefined();
    });

    it('reports zero mismatch when invoked matches executed count', async () => {
      const mock = jest.fn().mockResolvedValue([
        {
          capability: 'list_products',
          action: 'brain.capability.invoked',
          traceId: 'evt-1',
          at: '2026-05-12T10:00:00.000Z',
          requestId: 'req-1',
        },
        {
          capability: 'list_products',
          action: 'capability.executed',
          traceId: 'evt-2',
          at: '2026-05-12T10:00:01.000Z',
          requestId: 'req-1',
        },
      ]);

      const svc = buildAuditService(mock);
      const result = await svc.audit('2026-05-01T00:00:00.000Z');

      expect(result.capabilities).toHaveLength(1);
      expect(result.capabilities[0].name).toBe('list_products');
      expect(result.capabilities[0].invocations).toBe(1);
      expect(result.capabilities[0].spineEvents).toBe(1);
      expect(result.capabilities[0].missing).toBe(0);
      expect(result.totalMismatch).toBe(0);
    });

    it('detects mismatch when capability executed but no spine event fired', async () => {
      const mock = jest.fn().mockResolvedValue([
        {
          capability: 'search_contact',
          action: 'capability.executed',
          traceId: 'evt-3',
          at: '2026-05-12T11:00:00.000Z',
          requestId: 'req-2',
        },
        {
          capability: 'search_contact',
          action: 'capability.failed',
          traceId: 'evt-4',
          at: '2026-05-12T11:01:00.000Z',
          requestId: 'req-3',
        },
      ]);

      const svc = buildAuditService(mock);
      const result = await svc.audit('2026-05-01T00:00:00.000Z');

      expect(result.capabilities).toHaveLength(1);
      expect(result.capabilities[0].name).toBe('search_contact');
      expect(result.capabilities[0].invocations).toBe(2);
      expect(result.capabilities[0].spineEvents).toBe(0);
      expect(result.capabilities[0].missing).toBe(2);
      expect(result.totalMismatch).toBe(2);

      expect(result.capabilities[0].samples).toHaveLength(2);
      expect(result.capabilities[0].samples[0]).toHaveProperty('traceId');
      expect(result.capabilities[0].samples[0]).toHaveProperty('at');
    });

    it('sorts capabilities by mismatch desc then invocations desc', async () => {
      const mock = jest.fn().mockResolvedValue([
        { capability: 'a', action: 'capability.executed', traceId: 'x1', at: '2026-05-12T10:00:00.000Z', requestId: 'r1' },
        { capability: 'b', action: 'capability.executed', traceId: 'x2', at: '2026-05-12T10:00:00.000Z', requestId: 'r2' },
        { capability: 'b', action: 'brain.capability.invoked', traceId: 'x3', at: '2026-05-12T10:00:00.000Z', requestId: 'r2' },
      ]);

      const svc = buildAuditService(mock);
      const result = await svc.audit('2026-05-01T00:00:00.000Z');

      expect(result.capabilities).toHaveLength(2);
      expect(result.capabilities[0].name).toBe('a');
      expect(result.capabilities[0].missing).toBe(1);
      expect(result.capabilities[1].name).toBe('b');
      expect(result.capabilities[1].missing).toBe(0);
    });

    it('covers multiple capabilities with mixed outcomes', async () => {
      const mock = jest.fn().mockResolvedValue([
        { capability: 'list_products', action: 'brain.capability.invoked', traceId: 'e1', at: '2026-05-12T10:00:00.000Z', requestId: 'r1' },
        { capability: 'list_products', action: 'capability.executed', traceId: 'e2', at: '2026-05-12T10:00:01.000Z', requestId: 'r1' },
        { capability: 'search_contact', action: 'brain.capability.invoked', traceId: 'e3', at: '2026-05-12T10:01:00.000Z', requestId: 'r2' },
        { capability: 'search_contact', action: 'capability.failed', traceId: 'e4', at: '2026-05-12T10:01:01.000Z', requestId: 'r2' },
        { capability: 'query_revenue_summary', action: 'capability.executed', traceId: 'e5', at: '2026-05-12T10:02:00.000Z', requestId: 'r3' },
        { capability: 'query_revenue_summary', action: 'capability.executed', traceId: 'e6', at: '2026-05-12T10:03:00.000Z', requestId: 'r4' },
      ]);

      const svc = buildAuditService(mock);
      const result = await svc.audit('2026-05-01T00:00:00.000Z');

      const listProducts = result.capabilities.find((c) => c.name === 'list_products');
      const searchContact = result.capabilities.find((c) => c.name === 'search_contact');
      const revenue = result.capabilities.find((c) => c.name === 'query_revenue_summary');

      expect(listProducts?.invocations).toBe(1);
      expect(listProducts?.spineEvents).toBe(1);
      expect(listProducts?.missing).toBe(0);

      expect(searchContact?.invocations).toBe(1);
      expect(searchContact?.spineEvents).toBe(1);
      expect(searchContact?.missing).toBe(0);

      expect(revenue?.invocations).toBe(2);
      expect(revenue?.spineEvents).toBe(0);
      expect(revenue?.missing).toBe(2);

      expect(result.totalMismatch).toBe(2);
    });

    it('handles SQL injection-safe timestamp', async () => {
      const mock = jest.fn().mockResolvedValue([]);
      const svc = buildAuditService(mock);

      await svc.audit("2026-01-01T00:00:00.000Z'; DROP TABLE--");

      expect(mock).toHaveBeenCalledWith(
        expect.stringContaining('$1'),
        "2026-01-01T00:00:00.000Z'; DROP TABLE--",
      );
    });
  });
});
