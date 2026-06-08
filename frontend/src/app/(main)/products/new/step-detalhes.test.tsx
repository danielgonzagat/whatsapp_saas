import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { StepDetalhes } from './step-detalhes';
import { initialForm } from './types';

describe('StepDetalhes', () => {
  it('identifies the editable fields for autofill and accessibility tooling', () => {
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

    const name = screen.getByRole('textbox', { name: /nome do produto/i });
    const description = screen.getByRole('textbox', { name: /descricao/i });
    const category = screen.getByRole('combobox', { name: /categoria/i });
    const tag = screen.getByRole('textbox', { name: /tags/i });

    expect(name.getAttribute('id')).toBe('product-name');
    expect(name.getAttribute('name')).toBe('productName');
    expect(description.getAttribute('id')).toBe('product-description');
    expect(description.getAttribute('name')).toBe('productDescription');
    expect(category.getAttribute('id')).toBe('product-category');
    expect(category.getAttribute('name')).toBe('productCategory');
    expect(tag.getAttribute('id')).toBe('product-tags');
    expect(tag.getAttribute('name')).toBe('productTags');
  });

  it('names the tag removal action with the tag text', () => {
    render(
      <StepDetalhes
        form={{ ...initialForm, tags: ['auditoria'] }}
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

    expect(screen.getByRole('button', { name: /remover tag auditoria/i })).toBeTruthy();
  });

  it('exposes the selected product format as pressed', () => {
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

    expect(screen.getByRole('button', { name: /fisico/i }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: /^digital/i }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });
});
