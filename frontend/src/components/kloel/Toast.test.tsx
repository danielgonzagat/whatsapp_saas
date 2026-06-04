import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ToastProvider, useToast } from './Toast';

function ToastTrigger() {
  const { showToast } = useToast();

  return (
    <button
      type="button"
      onClick={() => showToast('Informe o nome do produto antes de continuar.', 'error')}
    >
      Mostrar erro
    </button>
  );
}

describe('ToastProvider', () => {
  it('announces error toast type and message to assistive tech', () => {
    render(
      <ToastProvider>
        <ToastTrigger />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText('Mostrar erro'));

    const alert = screen.getByRole('alert');
    const closeButton = screen.getByRole('button', {
      name: 'Fechar notificação Erro: Informe o nome do produto antes de continuar.',
    });

    expect(alert.textContent).toContain('Erro');
    expect(alert.textContent).toContain('Informe o nome do produto antes de continuar.');
    expect(closeButton).toBeTruthy();
  });
});
