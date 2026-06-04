import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { StepDetalhes } from './step-detalhes';
import { initialForm } from './types';

describe('StepDetalhes', () => {
  it('exposes the category selector with an accessible name', () => {
    render(
      <StepDetalhes
        form={initialForm}
        updateForm={vi.fn()}
        tagInput=""
        setTagInput={vi.fn()}
        onTagAdd={vi.fn()}
        onTagRemove={vi.fn()}
        categories={['Cursos Online']}
        catLoading={false}
        catError={null}
        localPreviewUrl={null}
        uploading={false}
        onFileSelect={vi.fn()}
        onClearPreview={vi.fn()}
      />,
    );

    expect(screen.getByRole('combobox', { name: /categoria/i })).toBeTruthy();
  });
});
