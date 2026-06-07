import { ReportService } from './report.service';

/**
 * Capability-resolver wiring proof for ReportService.
 *
 * The Capability Registry V2 declares two reports under canonical names
 * `ReportService.getOperations` and `ReportService.getAbandonments`. The
 * pre-existing canonical implementations live on `operations` and
 * `abandonments`. These specs prove the alias methods exist, forward
 * Date/string `since`, numeric `limit`, and delegate to the underlying
 * methods with the original signature shape.
 */
type GetOperationsFn = (
  workspaceId: string,
  args?: { since?: Date | string; limit?: number },
) => Promise<unknown>;
type GetAbandonmentsFn = GetOperationsFn;

const callGetOperations = (
  instance: {
    operations: (ws: string, opts?: { since?: Date; limit?: number }) => Promise<unknown>;
  },
  ws: string,
  args?: { since?: Date | string; limit?: number },
): Promise<unknown> =>
  (ReportService.prototype.getOperations as GetOperationsFn).call(instance, ws, args);

const callGetAbandonments = (
  instance: {
    abandonments: (ws: string, opts?: { since?: Date; limit?: number }) => Promise<unknown>;
  },
  ws: string,
  args?: { since?: Date | string; limit?: number },
): Promise<unknown> =>
  (ReportService.prototype.getAbandonments as GetAbandonmentsFn).call(instance, ws, args);

describe('ReportService canonical-name aliases (capability resolver wiring)', () => {
  describe('getOperations()', () => {
    it('delegates to operations with the same workspace and no opts when args omitted', async () => {
      const delegate = jest
        .fn()
        .mockResolvedValue({ orders: 1, sales: 2, refunds: 0, abandonments: 0 });
      const result = await callGetOperations({ operations: delegate }, 'ws-ops-1');

      const calls = delegate.mock.calls as Array<[string, { since?: Date; limit?: number }]>;
      expect(calls).toHaveLength(1);
      expect(calls[0]?.[0]).toBe('ws-ops-1');
      expect(calls[0]?.[1]).toEqual({});
      expect(result).toEqual({ orders: 1, sales: 2, refunds: 0, abandonments: 0 });
    });

    it('forwards a Date `since` unchanged', async () => {
      const delegate = jest
        .fn()
        .mockResolvedValue({ orders: 0, sales: 0, refunds: 0, abandonments: 0 });
      const since = new Date('2025-01-01T00:00:00.000Z');
      await callGetOperations({ operations: delegate }, 'ws-ops-2', { since });

      const calls = delegate.mock.calls as Array<[string, { since?: Date; limit?: number }]>;
      expect(calls[0]?.[1]?.since).toBe(since);
    });

    it('converts an ISO-string `since` to Date', async () => {
      const delegate = jest
        .fn()
        .mockResolvedValue({ orders: 0, sales: 0, refunds: 0, abandonments: 0 });
      await callGetOperations({ operations: delegate }, 'ws-ops-3', {
        since: '2025-02-15T12:00:00.000Z',
      });

      const calls = delegate.mock.calls as Array<[string, { since?: Date; limit?: number }]>;
      const forwarded = calls[0]?.[1]?.since;
      expect(forwarded).toBeInstanceOf(Date);
      expect(forwarded.toISOString()).toBe('2025-02-15T12:00:00.000Z');
    });

    it('forwards a numeric limit', async () => {
      const delegate = jest
        .fn()
        .mockResolvedValue({ orders: 0, sales: 0, refunds: 0, abandonments: 0 });
      await callGetOperations({ operations: delegate }, 'ws-ops-4', { limit: 25 });

      const calls = delegate.mock.calls as Array<[string, { since?: Date; limit?: number }]>;
      expect(calls[0]?.[1]?.limit).toBe(25);
    });
  });

  describe('getAbandonments()', () => {
    it('delegates to abandonments with the same workspace', async () => {
      const delegate = jest.fn().mockResolvedValue({ items: [], total: 0 });
      const result = await callGetAbandonments({ abandonments: delegate }, 'ws-ab-1');

      const calls = delegate.mock.calls as Array<[string, { since?: Date; limit?: number }]>;
      expect(calls).toHaveLength(1);
      expect(calls[0]?.[0]).toBe('ws-ab-1');
      expect(calls[0]?.[1]).toEqual({});
      expect(result).toEqual({ items: [], total: 0 });
    });

    it('forwards both since (string-converted) and limit when both are provided', async () => {
      const delegate = jest.fn().mockResolvedValue({ items: [], total: 0 });
      await callGetAbandonments({ abandonments: delegate }, 'ws-ab-2', {
        since: '2024-12-01T00:00:00.000Z',
        limit: 10,
      });

      const calls = delegate.mock.calls as Array<[string, { since?: Date; limit?: number }]>;
      const forwarded = calls[0]?.[1];
      expect(forwarded?.limit).toBe(10);
      expect(forwarded?.since).toBeInstanceOf(Date);
      expect(forwarded?.since?.toISOString()).toBe('2024-12-01T00:00:00.000Z');
    });

    it('forwards rejections from the underlying report query', async () => {
      const delegate = jest.fn().mockRejectedValue(new Error('db timeout'));
      await expect(callGetAbandonments({ abandonments: delegate }, 'ws-ab-3')).rejects.toThrow(
        'db timeout',
      );
    });
  });
});
