import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PipelineToolbar } from './PipelineToolbar';
import type { CRMPipeline } from './crm-pipeline-utils';

const pipelines: CRMPipeline[] = [
  { _id: 'pipeline-1', name: 'Principal' },
  { _id: 'pipeline-2', name: 'Enterprise' },
];

describe('PipelineToolbar accessibility', () => {
  it('keeps the pipeline selector identifiable for browser auditing', () => {
    const onSelectPipeline = vi.fn();

    render(
      <PipelineToolbar
        pipelines={pipelines}
        selectedPipelineId="pipeline-1"
        stageCount={4}
        dealCount={12}
        isLoading={false}
        onSelectPipeline={onSelectPipeline}
      />,
    );

    const select = screen.getByLabelText('Selecionar pipeline');

    expect(select.getAttribute('id')).toBe('crm-pipeline-select');
    expect(select.getAttribute('name')).toBe('crmPipelineSelect');

    fireEvent.change(select, { target: { value: 'pipeline-2' } });

    expect(onSelectPipeline).toHaveBeenCalledWith('pipeline-2');
  });
});
