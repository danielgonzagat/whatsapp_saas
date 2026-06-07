import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Fd, Modal, Tg } from './product-nerve-center.shared';

function expectIdentifiableField(field: HTMLElement, expectedName: string) {
  expect(field.getAttribute('id')).toMatch(/^product-nerve-/);
  expect(field.getAttribute('name')).toBe(expectedName);
}

describe('Fd', () => {
  it('renders the default input as an identifiable form field', () => {
    const { container } = render(<Fd label="Nome do produto" value="Produto" onChange={vi.fn()} />);

    const input = container.querySelector('input');

    expect(input).not.toBeNull();
    expect(screen.getByLabelText('Nome do produto')).toBe(input);
    expectIdentifiableField(input as HTMLInputElement, 'productNerveNomeDoProduto');
  });

  it('makes custom textarea/select/input children identifiable without replacing their props', () => {
    render(
      <>
        <Fd label="Descrição">
          <textarea defaultValue="Resumo" />
        </Fd>
        <Fd label="Formato">
          <select defaultValue="DIGITAL">
            <option value="DIGITAL">Digital</option>
          </select>
        </Fd>
        <Fd label="Campo externo">
          <input id="existing-id" name="existingName" aria-label="Campo preservado" defaultValue="x" />
        </Fd>
      </>,
    );

    expectIdentifiableField(screen.getByLabelText('Descrição'), 'productNerveDescricao');
    expectIdentifiableField(screen.getByLabelText('Formato'), 'productNerveFormato');
    expect(screen.getByLabelText('Campo preservado').getAttribute('id')).toBe('existing-id');
    expect(screen.getByLabelText('Campo preservado').getAttribute('name')).toBe('existingName');
  });

  it('marks invalid default inputs with accessible error feedback', () => {
    render(
      <Fd
        label="Nome do checkout"
        value=""
        onChange={vi.fn()}
        error="Informe o nome/descrição do checkout antes de salvar."
      />,
    );

    const input = screen.getByLabelText('Nome do checkout');
    const alert = screen.getByRole('alert');

    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe(alert.id);
    expect(alert.textContent).toBe('Informe o nome/descrição do checkout antes de salvar.');
  });
});

describe('Tg', () => {
  it('renders as an accessible switch with click and keyboard activation', () => {
    const onChange = vi.fn();

    render(<Tg label="Disponível para venda?" checked={false} onChange={onChange} />);

    const toggle = screen.getByRole('switch', { name: 'Disponível para venda?' });

    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
    fireEvent.keyDown(toggle, { key: 'Enter' });
    fireEvent.keyDown(toggle, { key: ' ' });

    expect(onChange).toHaveBeenCalledWith(true);
    expect(onChange).toHaveBeenCalledTimes(3);
  });
});

describe('Modal', () => {
  it('labels both close targets', () => {
    render(
      <Modal title="Criar novo plano" onClose={vi.fn()}>
        <span>Conteudo</span>
      </Modal>,
    );

    expect(screen.getAllByRole('button', { name: 'Fechar Criar novo plano' })).toHaveLength(2);
  });
});
