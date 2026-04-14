import { fireEvent, render, screen } from '@testing-library/react';
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
  it('opens the popover and activates a mutually exclusive capability', () => {
    const { props } = renderComposer();

    fireEvent.click(screen.getByLabelText('Abrir capacidades do prompt'));
    expect(screen.getByRole('button', { name: /Adicionar fotos e arquivos/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vincular Produto' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Criar imagem' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Criar site' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Buscar' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(props.onCapabilityChange).toHaveBeenCalledWith('search_web');
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
    expect(screen.getByText('Enviando arquivo...')).toBeInTheDocument();
    expect(screen.getAllByText('Produto Alfa').length).toBeGreaterThan(0);

    const sendButton = screen.getByLabelText('Enviar mensagem');
    expect(sendButton).toBeDisabled();

    fireEvent.click(screen.getByLabelText('Remover vínculo com Produto Alfa'));
    expect(props.onRemoveLinkedProduct).toHaveBeenCalledTimes(1);
  });
});
