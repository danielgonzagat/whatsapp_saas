import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { KloelChatComposer } from './KloelChatComposer';
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

describe('KloelChatComposer attachments', () => {
  it('allows sending a prompt made only of ready attachments', () => {
    const attachments: KloelChatAttachment[] = [
      {
        id: 'attachment_ready_pdf',
        name: 'catalogo.pdf',
        size: 2048,
        mimeType: 'application/pdf',
        kind: 'document',
        status: 'ready',
        url: 'https://cdn.kloel.test/catalogo.pdf',
      },
    ];

    const { props } = renderComposer({ attachments });

    expect(screen.queryByText(/pronto/i)).toBeNull();

    const sendButton = screen.getByLabelText('Enviar mensagem') as HTMLButtonElement;
    expect(sendButton.disabled).toBe(false);

    fireEvent.click(sendButton);
    expect(props.onSend).toHaveBeenCalledTimes(1);
  });

  it('keeps send blocked while an upload is still pending', () => {
    const attachments: KloelChatAttachment[] = [
      {
        id: 'attachment_uploading_pdf',
        name: 'catalogo.pdf',
        size: 2048,
        mimeType: 'application/pdf',
        kind: 'document',
        status: 'uploading',
      },
    ];

    const { props } = renderComposer({ input: 'Use o arquivo', attachments });

    const sendButton = screen.getByLabelText('Enviar mensagem') as HTMLButtonElement;
    expect(sendButton.disabled).toBe(true);

    fireEvent.click(sendButton);
    expect(props.onSend).not.toHaveBeenCalled();
  });

  it('keeps the Enter shortcut blocked while an upload is still pending', () => {
    const attachments: KloelChatAttachment[] = [
      {
        id: 'attachment_uploading_pdf',
        name: 'catalogo.pdf',
        size: 2048,
        mimeType: 'application/pdf',
        kind: 'document',
        status: 'uploading',
      },
    ];

    const { props } = renderComposer({ input: 'Use o arquivo', attachments });

    fireEvent.keyDown(screen.getByPlaceholderText('Como posso ajudar você hoje?'), {
      key: 'Enter',
      code: 'Enter',
    });

    expect(props.onSend).not.toHaveBeenCalled();
  });
});
