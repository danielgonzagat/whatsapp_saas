import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RichTextContentSubTab } from './ProductNerveCenterComissaoTab.richtext';

vi.mock('@/components/kloel/ToastProvider', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

describe('RichTextContentSubTab', () => {
  it('exposes the contenteditable editor as a named multiline textbox', () => {
    render(
      <RichTextContentSubTab
        productId="product-1"
        refreshProduct={vi.fn().mockResolvedValue(undefined)}
        setAffiliateSummary={vi.fn()}
        title="Merchan"
        description="Materiais para afiliados."
        initialValue=""
        saveField="merchandContent"
        successToast="Merchan salvo"
        errorToast="Erro ao salvar merchan"
      />,
    );

    const editor = screen.getByRole('textbox', { name: 'Editor de Merchan' });

    expect(editor.getAttribute('aria-multiline')).toBe('true');
    expect(editor.getAttribute('contenteditable')).toBe('true');
  });
});
