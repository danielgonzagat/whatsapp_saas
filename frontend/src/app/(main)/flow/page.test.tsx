import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Edge, Node } from 'reactflow';

import FlowPage from './page';

const state = vi.hoisted(() => ({
  replace: vi.fn(),
  saveFlow: vi.fn(),
  fetchFlow: vi.fn(),
  runFlow: vi.fn(),
  fetchExecutions: vi.fn(),
  fetchTemplates: vi.fn(),
  handleRetry: vi.fn(),
  handleDownload: vi.fn(),
  handleOptimize: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: state.replace }),
  useSearchParams: () => state.searchParams,
}));

vi.mock('@/hooks/useWorkspaceId', () => ({
  useWorkspaceId: () => 'workspace-1',
}));

vi.mock('@/hooks/useFlows', () => ({
  useFlows: () => ({
    saveFlow: state.saveFlow,
    fetchFlow: state.fetchFlow,
    runFlow: state.runFlow,
    error: null,
  }),
}));

vi.mock('@/hooks/useFlowExecutions', () => ({
  useFlowExecutions: () => ({
    executions: [],
    loading: false,
    error: null,
    fetchExecutions: state.fetchExecutions,
    handleRetry: state.handleRetry,
  }),
}));

vi.mock('@/hooks/useFlowTemplates', () => ({
  useFlowTemplates: () => ({
    templates: [],
    loading: false,
    error: null,
    downloading: false,
    downloadedIds: new Set<string>(),
    fetchTemplates: state.fetchTemplates,
    handleDownload: state.handleDownload,
  }),
}));

vi.mock('@/hooks/useFlowOptimize', () => ({
  useFlowOptimize: () => ({
    optimizing: false,
    result: null,
    error: null,
    handleOptimize: state.handleOptimize,
  }),
}));

vi.mock('@/components/flow/FlowBuilder', () => ({
  default: ({
    onSave,
    onTest,
  }: {
    onSave: (flow: { nodes: Node[]; edges: Edge[]; name: string }) => void;
    onTest: (flow: { nodes: Node[]; edges: Edge[]; name: string }) => void;
  }) => {
    const flow = {
      nodes: [{ id: 'start-1', type: 'start', position: { x: 0, y: 0 }, data: {} }] as Node[],
      edges: [] as Edge[],
      name: 'Smoke flow',
    };

    return (
      <div>
        <button type="button" onClick={() => onSave(flow)}>
          Builder save
        </button>
        <button type="button" onClick={() => onTest(flow)}>
          Builder test
        </button>
      </div>
    );
  },
}));

vi.mock('@/components/flow/FlowContextBar', () => ({
  FlowContextBar: () => <div data-testid="flow-context" />,
}));

vi.mock('@/components/flow/FlowExecutionsTab', () => ({
  FlowExecutionsTab: () => <div data-testid="flow-executions" />,
}));

vi.mock('@/components/flow/FlowTemplatesTab', () => ({
  FlowTemplatesTab: () => <div data-testid="flow-templates" />,
}));

vi.mock('@/components/kloel/KloelBrand', () => ({
  KloelLoadingState: () => <div>Carregando fluxo</div>,
  KloelMushroomMark: () => <span data-testid="kloel-mark" />,
}));

describe('FlowPage', () => {
  beforeEach(() => {
    state.replace.mockReset();
    state.saveFlow.mockReset();
    state.fetchFlow.mockReset();
    state.runFlow.mockReset();
    state.fetchExecutions.mockReset();
    state.fetchTemplates.mockReset();
    state.handleRetry.mockReset();
    state.handleDownload.mockReset();
    state.handleOptimize.mockReset();
    state.searchParams = new URLSearchParams();
  });

  it('tests the current graph by saving and running the confirmed saved flow', async () => {
    state.saveFlow.mockResolvedValueOnce({ id: 'flow-confirmed' });
    state.runFlow.mockResolvedValueOnce({ id: 'execution-1', status: 'COMPLETED' });
    state.fetchExecutions.mockResolvedValueOnce([]);

    render(<FlowPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Builder test' }));

    await waitFor(() => {
      expect(state.saveFlow).toHaveBeenCalledWith(expect.stringMatching(/^flow-/), {
        nodes: [{ id: 'start-1', type: 'start', position: { x: 0, y: 0 }, data: {} }],
        edges: [],
        name: 'Smoke flow',
      });
    });
    await waitFor(() => {
      expect(state.runFlow).toHaveBeenCalledWith(
        'flow-confirmed',
        'kloel-flow-test-runner',
        'start-1',
      );
    });
    expect(state.fetchExecutions).toHaveBeenCalled();
    expect(await screen.findByText('Teste executado')).toBeTruthy();
    expect(state.replace).toHaveBeenCalledWith('/flow?id=flow-confirmed');
  });
});
