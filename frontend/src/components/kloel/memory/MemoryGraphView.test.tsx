import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMemoryGraphMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/memory-graph', () => ({
  getMemoryGraph: getMemoryGraphMock,
}));

vi.mock('@/components/kloel/graph/KloelGraphLiteralCanvas', () => ({
  createDefaultKloelGraphSettings: () => ({}),
  KloelGraphLiteralCanvas: ({ nodes }: { nodes: readonly unknown[] }) => (
    <div data-testid="memory-graph-canvas">{nodes.length} nodes</div>
  ),
}));

import { MemoryGraphView } from './MemoryGraphView';

describe('MemoryGraphView', () => {
  beforeEach(() => {
    getMemoryGraphMock.mockReset();
  });

  it('shows a visible loading state before memory graph data resolves', () => {
    getMemoryGraphMock.mockReturnValue(new Promise(() => undefined));

    render(<MemoryGraphView />);

    expect(screen.getByRole('status')).toHaveTextContent('Carregando memória');
  });

  it('shows an honest error state when the memory graph request fails', async () => {
    getMemoryGraphMock.mockRejectedValueOnce(new Error('HTTP 304'));

    render(<MemoryGraphView />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar a memória do Kloel.',
    );
  });

  it('shows the empty memory message only after a confirmed empty graph payload', async () => {
    getMemoryGraphMock.mockResolvedValueOnce({ nodes: [], edges: [] });

    render(<MemoryGraphView />);

    expect(await screen.findByText(/O Kloel ainda não aprendeu nada sobre você/i)).toBeInTheDocument();
  });
});
