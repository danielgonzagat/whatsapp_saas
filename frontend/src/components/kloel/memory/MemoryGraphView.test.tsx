import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const memoryGraphApiMock = vi.hoisted(() => ({
  getMemoryGraph: vi.fn(),
  updateMemoryGraphNode: vi.fn(),
}));
const getMemoryGraphMock = memoryGraphApiMock.getMemoryGraph;

vi.mock('@/lib/api/memory-graph', () => ({
  getMemoryGraph: memoryGraphApiMock.getMemoryGraph,
  updateMemoryGraphNode: memoryGraphApiMock.updateMemoryGraphNode,
}));

vi.mock('@/components/kloel/graph/KloelGraphLiteralCanvas', () => ({
  createDefaultKloelGraphSettings: () => ({}),
  KloelGraphLiteralCanvas: ({
    nodes,
    onOpenNode,
  }: {
    nodes: ReadonlyArray<{ id: string; label: string }>;
    onOpenNode: (node: { id: string; label: string }) => void;
  }) => (
    <div data-testid="memory-graph-canvas">
      {nodes.length} nodes
      {nodes.map((node) => (
        <button key={node.id} type="button" onClick={() => onOpenNode(node)}>
          {node.label}
        </button>
      ))}
    </div>
  ),
}));

import { MemoryGraphView } from './MemoryGraphView';

describe('MemoryGraphView', () => {
  beforeEach(() => {
    getMemoryGraphMock.mockReset();
    memoryGraphApiMock.updateMemoryGraphNode.mockReset();
  });

  it('shows a visible loading state before memory graph data resolves', () => {
    getMemoryGraphMock.mockReturnValue(new Promise(() => undefined));

    render(<MemoryGraphView />);

    expect(screen.getByRole('status').textContent).toContain('Carregando memória');
  });

  it('shows an honest error state when the memory graph request fails', async () => {
    getMemoryGraphMock.mockRejectedValueOnce(new Error('HTTP 304'));

    render(<MemoryGraphView />);

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Não foi possível carregar a memória do Kloel.',
    );
  });

  it('shows the empty memory message only after a confirmed empty graph payload', async () => {
    getMemoryGraphMock.mockResolvedValueOnce({ nodes: [], edges: [] });

    render(<MemoryGraphView />);

    expect(await screen.findByText(/O Kloel ainda não aprendeu nada sobre você/i)).not.toBeNull();
  });

  it('opens a memory node and blocks it from agent use through the graph panel', async () => {
    const initialGraph = {
      nodes: [
        { id: 'you', label: 'Você', group: 'center' },
        {
          id: 'mem-1',
          label: 'Prefere bullets',
          group: 'preference',
          content: 'O usuário prefere bullets',
          summary: 'Prefere bullets',
          state: 'confirmed',
          blockedForAgent: false,
        },
      ],
      edges: [{ from: 'you', to: 'mem-1', relation: 'belongs_to' }],
    };
    const updatedGraph = {
      ...initialGraph,
      nodes: [initialGraph.nodes[0], { ...initialGraph.nodes[1], state: 'blocked', blockedForAgent: true }],
    };
    getMemoryGraphMock.mockResolvedValueOnce(initialGraph);
    memoryGraphApiMock.updateMemoryGraphNode.mockResolvedValueOnce(updatedGraph);
    const { fireEvent, waitFor } = await import('@testing-library/react');

    render(<MemoryGraphView />);

    fireEvent.click(await screen.findByRole('button', { name: 'Prefere bullets' }));
    expect(screen.getByLabelText('Editar memória')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Bloquear agente' }));

    await waitFor(() => {
      expect(memoryGraphApiMock.updateMemoryGraphNode).toHaveBeenCalledWith('mem-1', {
        blockedForAgent: true,
      });
    });
    expect(await screen.findByRole('button', { name: 'Permitir agente' })).not.toBeNull();
  });

  it('refreshes the editor from the persisted memory returned by the source of truth', async () => {
    const initialGraph = {
      nodes: [
        { id: 'you', label: 'Você', group: 'center' },
        {
          id: 'mem-1',
          label: 'Prefere bullets',
          group: 'preference',
          content: 'O usuário prefere bullets',
          summary: 'Prefere bullets',
          state: 'confirmed',
          blockedForAgent: false,
        },
      ],
      edges: [{ from: 'you', to: 'mem-1', relation: 'belongs_to' }],
    };
    const updatedGraph = {
      ...initialGraph,
      nodes: [
        initialGraph.nodes[0],
        {
          ...initialGraph.nodes[1],
          content: 'Conteúdo persistido e normalizado',
          summary: 'Resumo persistido e normalizado',
        },
      ],
    };
    getMemoryGraphMock.mockResolvedValueOnce(initialGraph);
    memoryGraphApiMock.updateMemoryGraphNode.mockResolvedValueOnce(updatedGraph);
    const { fireEvent, waitFor } = await import('@testing-library/react');

    render(<MemoryGraphView />);

    fireEvent.click(await screen.findByRole('button', { name: 'Prefere bullets' }));
    fireEvent.change(screen.getByLabelText('Resumo'), {
      target: { value: 'Resumo editado pelo usuário' },
    });
    fireEvent.change(screen.getByLabelText('Memória'), {
      target: { value: 'Conteúdo editado pelo usuário' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar texto' }));

    await waitFor(() => {
      expect(memoryGraphApiMock.updateMemoryGraphNode).toHaveBeenCalledWith('mem-1', {
        content: 'Conteúdo editado pelo usuário',
        summary: 'Resumo editado pelo usuário',
      });
    });
    expect(await screen.findByDisplayValue('Resumo persistido e normalizado')).not.toBeNull();
    expect(screen.getByDisplayValue('Conteúdo persistido e normalizado')).not.toBeNull();
  });

  it('forgets the selected memory and closes the editor panel when the source of truth removes it', async () => {
    const initialGraph = {
      nodes: [
        { id: 'you', label: 'Você', group: 'center' },
        {
          id: 'mem-1',
          label: 'Preferência temporária',
          group: 'preference',
          content: 'Não deve voltar para o agente',
          summary: 'Preferência temporária',
          state: 'confirmed',
          blockedForAgent: false,
        },
      ],
      edges: [{ from: 'you', to: 'mem-1', relation: 'belongs_to' }],
    };
    const updatedGraph = {
      nodes: [initialGraph.nodes[0]],
      edges: [],
    };
    getMemoryGraphMock.mockResolvedValueOnce(initialGraph);
    memoryGraphApiMock.updateMemoryGraphNode.mockResolvedValueOnce(updatedGraph);
    const { fireEvent, waitFor } = await import('@testing-library/react');

    render(<MemoryGraphView />);

    fireEvent.click(await screen.findByRole('button', { name: 'Preferência temporária' }));
    expect(screen.getByLabelText('Editar memória')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Esquecer' }));

    await waitFor(() => {
      expect(memoryGraphApiMock.updateMemoryGraphNode).toHaveBeenCalledWith('mem-1', {
        forgotten: true,
      });
    });
    await waitFor(() => {
      expect(screen.queryByLabelText('Editar memória')).toBeNull();
    });
    expect(screen.queryByRole('button', { name: 'Preferência temporária' })).toBeNull();
  });

  it('limits a large memory graph by default and lets the user filter by memory type', async () => {
    const memoryNodes = Array.from({ length: 95 }, (_, index) => ({
      id: `mem-${index}`,
      label: index % 2 === 0 ? `Preferência ${index}` : `Projeto ${index}`,
      group: index % 2 === 0 ? 'preference' : 'project',
      content: `Memória ${index}`,
      summary: index % 2 === 0 ? `Preferência ${index}` : `Projeto ${index}`,
      state: 'confirmed',
      importance: index % 2 === 0 ? 0.9 : 0.4,
      pinned: index === 94,
    }));
    getMemoryGraphMock.mockResolvedValueOnce({
      nodes: [{ id: 'you', label: 'Você', group: 'center' }, ...memoryNodes],
      edges: memoryNodes.map((node) => ({ from: 'you', to: node.id, relation: 'belongs_to' })),
    });
    const { fireEvent } = await import('@testing-library/react');

    render(<MemoryGraphView />);

    expect(await screen.findByText('61 nodes')).not.toBeNull();
    expect(screen.getByText('60 de 95 memórias visíveis')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Projeto 61' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Preferência 0' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Preferência 94' })).not.toBeNull();

    fireEvent.change(screen.getByLabelText('Tipo de memória'), { target: { value: 'project' } });

    expect(screen.getByText('48 nodes')).not.toBeNull();
    expect(screen.getByText('47 de 47 memórias visíveis')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Projeto 61' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Preferência 0' })).toBeNull();
  });

  it('filters memory graph by state and policy flags without changing the graph renderer', async () => {
    const memoryNodes = [
      { id: 'mem-confirmed', label: 'Confirmada', group: 'fact', state: 'confirmed' },
      {
        id: 'mem-blocked',
        label: 'Bloqueada',
        group: 'fact',
        state: 'blocked',
        blockedForAgent: true,
      },
      {
        id: 'mem-sensitive',
        label: 'Sensível',
        group: 'preference',
        state: 'sensitive',
        sensitive: true,
      },
      {
        id: 'mem-pinned',
        label: 'Fixada',
        group: 'project',
        state: 'confirmed',
        pinned: true,
      },
      {
        id: 'mem-archived',
        label: 'Arquivada',
        group: 'summary',
        state: 'archived',
        archived: true,
      },
    ];
    getMemoryGraphMock.mockResolvedValueOnce({
      nodes: [{ id: 'you', label: 'Você', group: 'center' }, ...memoryNodes],
      edges: memoryNodes.map((node) => ({ from: 'you', to: node.id, relation: 'belongs_to' })),
    });
    const { fireEvent } = await import('@testing-library/react');

    render(<MemoryGraphView />);

    expect(await screen.findByText('6 nodes')).not.toBeNull();
    fireEvent.change(screen.getByLabelText('Estado da memória'), { target: { value: 'blocked' } });

    expect(screen.getByText('2 nodes')).not.toBeNull();
    expect(screen.getByText('1 de 1 memórias visíveis')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Bloqueada' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Confirmada' })).toBeNull();

    fireEvent.change(screen.getByLabelText('Estado da memória'), { target: { value: 'sensitive' } });

    expect(screen.getByRole('button', { name: 'Sensível' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Bloqueada' })).toBeNull();

    fireEvent.change(screen.getByLabelText('Estado da memória'), { target: { value: 'pinned' } });

    expect(screen.getByRole('button', { name: 'Fixada' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Sensível' })).toBeNull();
  });
});
