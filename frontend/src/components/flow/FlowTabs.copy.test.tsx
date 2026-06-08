import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FlowExecutionsTab } from './FlowExecutionsTab';
import { FlowTemplatesTab } from './FlowTemplatesTab';
import type { FlowExecutionSummary } from '@/lib/api/flows';

const pendingExecution: FlowExecutionSummary = {
  id: 'exec-1',
  status: 'PENDING',
  flow: { name: 'Flow Codex Audit' },
  contact: null,
  createdAt: '2026-06-08T12:03:25.000Z',
  updatedAt: '2026-06-08T12:03:25.000Z',
};

describe('Flow tabs copy', () => {
  it('presents execution status as product copy instead of backend enum text', () => {
    render(
      <FlowExecutionsTab
        executions={[pendingExecution]}
        loading={false}
        error={null}
        onRefresh={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Histórico de Execuções' })).toBeTruthy();
    expect(screen.getByText('Pendente')).toBeTruthy();
    expect(screen.queryByText('PENDING')).toBeNull();
  });

  it('uses polished Portuguese copy for the empty templates state', () => {
    render(
      <FlowTemplatesTab
        templates={[]}
        loading={false}
        error={null}
        downloading={{}}
        downloadedIds={new Set()}
        categoryColors={{}}
        onRefresh={vi.fn()}
        onDownload={vi.fn()}
      />,
    );

    expect(screen.getByText('Nenhum template público disponível ainda')).toBeTruthy();
    expect(screen.getByText('Templates criados por admins aparecerão aqui')).toBeTruthy();
  });
});
