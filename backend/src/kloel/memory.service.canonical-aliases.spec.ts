import { MemoryService } from './memory.service';

/**
 * Capability-resolver wiring proof for MemoryService.
 *
 * The Capability Registry V2 declares `MemoryService.search` and
 * `MemoryService.set`. The pre-existing canonical implementations are
 * `searchMemory` and `saveMemory`. These specs prove the aliases
 * exist, extract the `query/limit/category` (search) or
 * `key/value/category/content` (set) args, and delegate to the
 * underlying methods with the original positional signature.
 */
type SearchFn = (
  workspaceId: string,
  args?: { query?: string; limit?: number; category?: string },
) => Promise<unknown>;
type SetFn = (
  workspaceId: string,
  args?: { key?: string; value?: unknown; category?: string; content?: string },
) => Promise<unknown>;

const callSearch = (
  instance: {
    searchMemory: (ws: string, q: string, limit: number, category?: string) => Promise<unknown>;
  },
  ws: string,
  args?: { query?: string; limit?: number; category?: string },
): Promise<unknown> => (MemoryService.prototype.search as SearchFn).call(instance, ws, args);

const callSet = (
  instance: {
    saveMemory: (
      ws: string,
      key: string,
      value: unknown,
      category?: string,
      content?: string,
    ) => Promise<unknown>;
  },
  ws: string,
  args?: { key?: string; value?: unknown; category?: string; content?: string },
): Promise<unknown> => (MemoryService.prototype.set as SetFn).call(instance, ws, args);

describe('MemoryService canonical-name aliases (capability resolver wiring)', () => {
  describe('search()', () => {
    it('delegates to searchMemory with empty query and defaults when args is undefined', async () => {
      const delegate = jest.fn().mockResolvedValue({ items: [] });
      await callSearch({ searchMemory: delegate }, 'ws-mem-1');

      const calls = delegate.mock.calls as Array<[string, string, number, string | undefined]>;
      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual(['ws-mem-1', '', 5, undefined]);
    });

    it('forwards query, limit and category when present', async () => {
      const delegate = jest.fn().mockResolvedValue({ items: [{ key: 'a' }] });
      const result = await callSearch({ searchMemory: delegate }, 'ws-mem-2', {
        query: 'find me',
        limit: 10,
        category: 'sales',
      });

      const calls = delegate.mock.calls as Array<[string, string, number, string | undefined]>;
      expect(calls[0]).toEqual(['ws-mem-2', 'find me', 10, 'sales']);
      expect(result).toEqual({ items: [{ key: 'a' }] });
    });

    it('uses default limit when limit is not a number', async () => {
      const delegate = jest.fn().mockResolvedValue({ items: [] });
      await callSearch({ searchMemory: delegate }, 'ws-mem-3', {
        query: 'q',
        limit: 'not-a-number' as unknown as number,
      });

      const calls = delegate.mock.calls as Array<[string, string, number, string | undefined]>;
      expect(calls[0]?.[2]).toBe(5);
    });
  });

  describe('set()', () => {
    it('throws when args.key is missing', async () => {
      const delegate = jest.fn();
      await expect(callSet({ saveMemory: delegate }, 'ws-mem-4')).rejects.toThrow(
        'MemoryService.set: args.key is required',
      );
      expect(delegate).not.toHaveBeenCalled();
    });

    it('delegates to saveMemory with required key + value when both provided', async () => {
      const delegate = jest.fn().mockResolvedValue({ id: 'mem-1' });
      await callSet({ saveMemory: delegate }, 'ws-mem-5', {
        key: 'lead.name',
        value: 'Alice',
      });

      const calls = delegate.mock.calls as Array<
        [string, string, unknown, string | undefined, string | undefined]
      >;
      expect(calls[0]).toEqual(['ws-mem-5', 'lead.name', 'Alice', 'general', undefined]);
    });

    it('forwards optional category and content', async () => {
      const delegate = jest.fn().mockResolvedValue({ id: 'mem-2' });
      await callSet({ saveMemory: delegate }, 'ws-mem-6', {
        key: 'product.notes',
        value: { color: 'blue' },
        category: 'product',
        content: 'Cliente quer azul-marinho',
      });

      const calls = delegate.mock.calls as Array<
        [string, string, unknown, string | undefined, string | undefined]
      >;
      expect(calls[0]).toEqual([
        'ws-mem-6',
        'product.notes',
        { color: 'blue' },
        'product',
        'Cliente quer azul-marinho',
      ]);
    });

    it('falls back to null value when args.value is undefined', async () => {
      const delegate = jest.fn().mockResolvedValue({ id: 'mem-3' });
      await callSet({ saveMemory: delegate }, 'ws-mem-7', { key: 'k', value: undefined });

      const calls = delegate.mock.calls as Array<
        [string, string, unknown, string | undefined, string | undefined]
      >;
      expect(calls[0]?.[2]).toBeNull();
    });
  });
});
