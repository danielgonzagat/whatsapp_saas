import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RichTextContentSubTab } from './ProductNerveCenterComissaoTab.richtext';

vi.mock('@/components/kloel/ToastProvider', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

function renderMerchan(initialValue = '') {
  return render(
    <RichTextContentSubTab
      productId="product-1"
      refreshProduct={vi.fn().mockResolvedValue(undefined)}
      setAffiliateSummary={vi.fn()}
      title="Merchan"
      description="Materiais para afiliados."
      initialValue={initialValue}
      saveField="merchandContent"
      successToast="Merchan salvo"
      errorToast="Erro ao salvar merchan"
    />,
  );
}

function selectEditorContents(editor: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(editor);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

describe('RichTextContentSubTab', () => {
  it('exposes the contenteditable editor as a named multiline textbox', () => {
    renderMerchan();

    const editor = screen.getByRole('textbox', { name: 'Editor de Merchan' });

    expect(editor.getAttribute('aria-multiline')).toBe('true');
    expect(editor.getAttribute('contenteditable')).toBe('true');
  });

  it('applies bold formatting to the selected editor text', () => {
    renderMerchan('Oferta especial');

    const editor = screen.getByRole('textbox', { name: 'Editor de Merchan' });
    selectEditorContents(editor);

    fireEvent.mouseDown(screen.getByRole('button', { name: 'B' }));
    fireEvent.click(screen.getByRole('button', { name: 'B' }));

    expect(editor.innerHTML).toBe('<b>Oferta especial</b>');
  });

  it('turns the selected editor text into a normalized link', () => {
    renderMerchan('Oferta');

    const editor = screen.getByRole('textbox', { name: 'Editor de Merchan' });
    selectEditorContents(editor);

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Inserir link' }));
    fireEvent.click(screen.getByRole('button', { name: 'Inserir link' }));
    fireEvent.change(screen.getByLabelText('URL do link'), {
      target: { value: 'example.com/oferta' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar link' }));

    const link = editor.querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://example.com/oferta');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.textContent).toBe('Oferta');
  });
});
