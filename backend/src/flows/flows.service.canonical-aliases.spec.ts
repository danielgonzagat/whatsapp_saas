import { FlowsService } from './flows.service';

/**
 * Capability-resolver wiring proof for FlowsService.
 *
 * The Capability Registry V2 declares `FlowService.create` (and the
 * `FlowService` token is mapped to the real `FlowsService` class via
 * `KloelDomainServiceResolver.SERVICE_TOKEN_MAP`). The canonical
 * implementation under the resolver-compatible name `create` was added
 * as a thin alias over the pre-existing `save` upsert. The spec proves
 * the alias generates a fresh UUID, supplies safe defaults for
 * `nodes`/`edges`, and forwards `name` through to `save`.
 */
type CreateFn = (
  workspaceId: string,
  args?: { name?: string; nodes?: unknown; edges?: unknown },
) => Promise<unknown>;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const callCreate = (
  instance: {
    save: (
      ws: string,
      flowId: string,
      data: { nodes: unknown; edges: unknown; name?: string },
    ) => Promise<unknown>;
  },
  ws: string,
  args?: { name?: string; nodes?: unknown; edges?: unknown },
): Promise<unknown> => (FlowsService.prototype.create as CreateFn).call(instance, ws, args);

describe('FlowsService canonical-name aliases (capability resolver wiring)', () => {
  describe('create()', () => {
    it('delegates to save with a fresh UUID and empty nodes/edges when args omitted', async () => {
      const delegate = jest.fn().mockResolvedValue({ id: 'stored' });
      await callCreate({ save: delegate }, 'ws-flow-1');

      const calls = delegate.mock.calls as Array<
        [string, string, { nodes: unknown; edges: unknown; name?: string }]
      >;
      expect(calls).toHaveLength(1);
      expect(calls[0]?.[0]).toBe('ws-flow-1');
      expect(calls[0]?.[1]).toMatch(UUID_REGEX);
      expect(calls[0]?.[2]).toEqual({ nodes: [], edges: [] });
    });

    it('forwards args.name into save() data', async () => {
      const delegate = jest.fn().mockResolvedValue({ id: 'stored' });
      await callCreate({ save: delegate }, 'ws-flow-2', { name: 'Funil de boas-vindas' });

      const calls = delegate.mock.calls as Array<
        [string, string, { nodes: unknown; edges: unknown; name?: string }]
      >;
      expect(calls[0]?.[2]?.name).toBe('Funil de boas-vindas');
    });

    it('forwards array nodes and edges through to save()', async () => {
      const delegate = jest.fn().mockResolvedValue({ id: 'stored' });
      const nodes = [{ id: 'n1', type: 'start' }];
      const edges = [{ from: 'n1', to: 'n2' }];
      await callCreate({ save: delegate }, 'ws-flow-3', { nodes, edges });

      const calls = delegate.mock.calls as Array<
        [string, string, { nodes: unknown; edges: unknown; name?: string }]
      >;
      expect(calls[0]?.[2]?.nodes).toBe(nodes);
      expect(calls[0]?.[2]?.edges).toBe(edges);
    });

    it('substitutes empty arrays when nodes/edges are not arrays', async () => {
      const delegate = jest.fn().mockResolvedValue({ id: 'stored' });
      await callCreate({ save: delegate }, 'ws-flow-4', {
        nodes: 'not-an-array',
        edges: 123,
      });

      const calls = delegate.mock.calls as Array<
        [string, string, { nodes: unknown; edges: unknown; name?: string }]
      >;
      expect(calls[0]?.[2]?.nodes).toEqual([]);
      expect(calls[0]?.[2]?.edges).toEqual([]);
    });

    it('generates distinct ids on consecutive calls', async () => {
      const delegate = jest.fn().mockResolvedValue({ id: 'stored' });
      await callCreate({ save: delegate }, 'ws-flow-5');
      await callCreate({ save: delegate }, 'ws-flow-5');

      const calls = delegate.mock.calls as Array<
        [string, string, { nodes: unknown; edges: unknown; name?: string }]
      >;
      expect(calls[0]?.[1]).not.toBe(calls[1]?.[1]);
    });
  });
});
