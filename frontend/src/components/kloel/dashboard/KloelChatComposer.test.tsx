import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { KloelChatComposer, type KloelChatSelectableProduct } from './KloelChatComposer';
import type { KloelChatAttachment } from '@/lib/kloel-chat';

function renderComposer(overrides?: Partial<ComponentProps<typeof KloelChatComposer>>) {
  const inputRef = { current: null };

  const props: ComponentProps<typeof KloelChatComposer> = {
    input: '',
    placeholder: 'Como posso ajudar você hoje?',
    disabled: false,
    activeCapability: null,
    attachments: [],
    linkedProduct: null,
    selectableProducts: [],
    productsLoading: false,
    inputRef,
    onInputChange: vi.fn(),
    onSend: vi.fn(),
    onOpenFilePicker: vi.fn(),
    onRemoveAttachment: vi.fn(),
    onRetryAttachment: vi.fn(),
    onSelectProduct: vi.fn(),
    onRemoveLinkedProduct: vi.fn(),
    onCapabilityChange: vi.fn(),
    ...overrides,
  };

  return {
    ...render(<KloelChatComposer {...props} />),
    props,
  };
}

describe('KloelChatComposer', () => {
  it('names the main prompt textbox for browser autofill and accessibility diagnostics', () => {
    renderComposer();

    const textbox = screen.getByRole('textbox', { name: 'Mensagem para o Kloel' });
    expect(textbox.getAttribute('id')).toBe('kloel-chat-composer-input');
    expect(textbox.getAttribute('name')).toBe('message');
  });

  it('labels the active capability as a removable pressed context', () => {
    const { props } = renderComposer({ activeCapability: 'create_image' });

    const activeCapability = screen.getByRole('button', {
      name: 'Remover capacidade Criar imagem',
    });

    expect(activeCapability.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(activeCapability);
    expect(props.onCapabilityChange).toHaveBeenCalledWith(null);
  });

  it('opens the popover and activates a mutually exclusive capability', () => {
    const { props } = renderComposer();

    fireEvent.click(screen.getByLabelText('Abrir capacidades do prompt'));
    expect(screen.getByRole('button', { name: /Adicionar fotos e arquivos/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vincular Produto' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Criar imagem' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Criar site' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Buscar' })).toBeInTheDocument();
    screen.getByRole('button', { name: 'Mesa de refinamento' });

    fireEvent.click(screen.getByRole('button', { name: 'Mesa de refinamento' }));
    expect(props.onCapabilityChange).toHaveBeenCalledWith('refine_response');
  });

  it('coalesces burst input changes before notifying the dashboard', () => {
    vi.useFakeTimers();
    try {
      const { props } = renderComposer({ input: 'texto atual' });
      const textarea = screen.getByPlaceholderText('Como posso ajudar você hoje?');

      fireEvent.change(textarea, { target: { value: 'texto atual' } });
      expect(props.onInputChange).not.toHaveBeenCalled();

      fireEvent.change(textarea, { target: { value: 'texto novo' } });
      fireEvent.change(textarea, { target: { value: 'texto novo' } });
      fireEvent.change(textarea, { target: { value: 'texto final' } });
      expect(props.onInputChange).not.toHaveBeenCalled();

      act(() => {
        vi.runOnlyPendingTimers();
      });

      expect(props.onInputChange).toHaveBeenCalledTimes(1);
      expect(props.onInputChange).toHaveBeenCalledWith('texto final');
    } finally {
      vi.useRealTimers();
    }
  });

  it('sends the current local draft before the dashboard echoes it back', () => {
    const { props } = renderComposer();
    const textarea = screen.getByPlaceholderText('Como posso ajudar você hoje?');

    fireEvent.change(textarea, { target: { value: 'valor local' } });
    fireEvent.click(screen.getByLabelText('Enviar mensagem'));

    expect(props.onSend).toHaveBeenCalledWith('valor local');
  });

  it('opens the capability popover above the composer by default', () => {
    renderComposer();

    fireEvent.click(screen.getByLabelText('Abrir capacidades do prompt'));

    const popover = screen.getByTestId('kloel-composer-popover');
    expect(popover.style.bottom).toBe('calc(100% + 12px)');
    expect(popover.style.top).toBe('');
  });

  it('opens the product submenu and selects a linked product', () => {
    const selectableProducts: KloelChatSelectableProduct[] = [
      {
        id: 'product_1',
        source: 'owned',
        name: 'Produto Alfa',
        imageUrl: 'https://cdn.kloel.test/produto-alfa.png',
        status: 'published',
        productId: 'product_1',
        subtitle: 'Curso online',
      },
    ];

    const { props } = renderComposer({ selectableProducts });

    fireEvent.click(screen.getByLabelText('Abrir capacidades do prompt'));
    fireEvent.click(screen.getByRole('button', { name: 'Vincular Produto' }));
    fireEvent.click(screen.getByText('Produto Alfa'));

    expect(props.onSelectProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'product_1',
        name: 'Produto Alfa',
        status: 'published',
      }),
    );
  });

  it('renders attachment and linked product previews and blocks send during upload', () => {
    const attachments: KloelChatAttachment[] = [
      {
        id: 'attachment_uploading',
        name: 'brief.pdf',
        size: 2048,
        mimeType: 'application/pdf',
        kind: 'document',
        status: 'uploading',
      },
      {
        id: 'attachment_ready',
        name: 'produto.png',
        size: 4096,
        mimeType: 'image/png',
        kind: 'image',
        status: 'ready',
        previewUrl: 'https://cdn.kloel.test/produto.png',
      },
    ];

    const { props } = renderComposer({
      input: 'Use os anexos',
      attachments,
      linkedProduct: {
        id: 'product_1',
        source: 'owned',
        name: 'Produto Alfa',
        imageUrl: 'https://cdn.kloel.test/produto-alfa.png',
        status: 'published',
        productId: 'product_1',
        subtitle: 'Curso online',
      },
    });

    expect(screen.getByText('brief.pdf')).toBeInTheDocument();
    expect(screen.getByText('Enviando')).toBeInTheDocument();
    expect(screen.getAllByText('Produto Alfa').length).toBeGreaterThan(0);

    const sendButton = screen.getByLabelText('Enviar mensagem');
    expect(sendButton).toBeDisabled();

    fireEvent.click(screen.getByLabelText('Remover vínculo com Produto Alfa'));
    expect(props.onRemoveLinkedProduct).toHaveBeenCalledTimes(1);
  });


  it('keeps rendering a visual thumbnail when an uploaded image keeps its preview but backend kind drifts', () => {
    renderComposer({
      attachments: [
        {
          id: 'attachment_visual_drift',
          name: 'produto-final.png',
          size: 4096,
          mimeType: 'image/png',
          kind: 'document',
          status: 'ready',
          previewUrl: 'blob:produto-final',
          url: 'https://cdn.kloel.test/produto-final.png',
        },
      ],
    });

    const preview = screen.getByAltText('produto-final.png');
    expect(preview).toBeInTheDocument();
    expect(preview).toHaveAttribute('src', 'blob:produto-final');
    expect(screen.queryByText('4 KB · pronto')).not.toBeInTheDocument();
  });
});
