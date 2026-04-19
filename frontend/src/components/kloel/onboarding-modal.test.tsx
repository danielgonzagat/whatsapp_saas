import type { ReactNode, SelectHTMLAttributes } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/ui/select', () => {
  const React = require('react') as typeof import('react');

  function Select({
    value,
    onValueChange,
    children,
  }: {
    value?: string;
    onValueChange?: (value: string) => void;
    children: ReactNode;
  }) {
    return React.createElement(
      React.Fragment,
      null,
      React.Children.map(children, (child) =>
        React.isValidElement(child)
          ? React.cloneElement(child as React.ReactElement<any>, { value, onValueChange })
          : child,
      ),
    );
  }

  function SelectTrigger({
    value,
    onValueChange,
  }: {
    value?: string;
    onValueChange?: (value: string) => void;
  }) {
    return React.createElement(
      'select',
      {
        'aria-label': 'Objetivo principal com o Kloel',
        role: 'combobox',
        value: value || '',
        onChange: (event: React.ChangeEvent<HTMLSelectElement>) => onValueChange?.(event.target.value),
      },
      [
        React.createElement('option', { key: 'placeholder', value: '' }, 'Selecione seu objetivo'),
        React.createElement(
          'option',
          { key: 'automate', value: 'automate' },
          'Automatizar atendimento no WhatsApp',
        ),
        React.createElement(
          'option',
          { key: 'sales', value: 'sales' },
          'Aumentar vendas no automatico',
        ),
        React.createElement(
          'option',
          { key: 'support', value: 'support' },
          'Melhorar suporte ao cliente',
        ),
        React.createElement(
          'option',
          { key: 'scale', value: 'scale' },
          'Escalar o negocio sem equipe',
        ),
      ],
    );
  }

  function SelectContent({ children }: { children: ReactNode }) {
    return React.createElement(React.Fragment, null, children);
  }

  function SelectItem({
    value,
    children,
  }: {
    value: string;
    children: ReactNode;
  }) {
    return React.createElement('option', { value }, children);
  }

  function SelectValue({ placeholder }: { placeholder?: string }) {
    return React.createElement(React.Fragment, null, placeholder || null);
  }

  return { Select, SelectTrigger, SelectContent, SelectItem, SelectValue };
});

import { OnboardingModal } from './onboarding-modal';

function selectBusinessObjective() {
  fireEvent.change(screen.getByRole('combobox'), {
    target: { value: 'automate' },
  });
}

describe('OnboardingModal', () => {
  it('uses Meta-first wording in the final connection step', () => {
    render(
      <OnboardingModal
        isOpen={true}
        onComplete={vi.fn()}
        onClose={vi.fn()}
        onTeachProducts={vi.fn()}
        onConnectWhatsApp={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('Ex: Minha Loja Digital'), {
      target: { value: 'Kloel' },
    });
    fireEvent.change(screen.getByPlaceholderText('Ex: E-commerce, Infoprodutos, Servicos'), {
      target: { value: 'SaaS' },
    });
    selectBusinessObjective();
    fireEvent.click(screen.getByRole('button', { name: /Avancar/i }));
    fireEvent.click(screen.getByRole('button', { name: /Avancar/i }));

    expect(screen.getByText('Conectar canais Meta')).toBeInTheDocument();
    expect(
      screen.getByText(/Conecte os canais oficiais da Meta para que o Kloel opere WhatsApp/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/QR/i)).not.toBeInTheDocument();
  });

  it('resets back to the first step when the modal is reopened', () => {
    const { rerender } = render(
      <OnboardingModal
        isOpen={true}
        onComplete={vi.fn()}
        onClose={vi.fn()}
        onTeachProducts={vi.fn()}
        onConnectWhatsApp={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('Ex: Minha Loja Digital'), {
      target: { value: 'Kloel' },
    });
    fireEvent.change(screen.getByPlaceholderText('Ex: E-commerce, Infoprodutos, Servicos'), {
      target: { value: 'SaaS' },
    });
    selectBusinessObjective();
    fireEvent.click(screen.getByRole('button', { name: /Avancar/i }));

    expect(screen.getByText('Ensinar o Kloel')).toBeInTheDocument();

    rerender(
      <OnboardingModal
        isOpen={false}
        onComplete={vi.fn()}
        onClose={vi.fn()}
        onTeachProducts={vi.fn()}
        onConnectWhatsApp={vi.fn()}
      />,
    );
    rerender(
      <OnboardingModal
        isOpen={true}
        onComplete={vi.fn()}
        onClose={vi.fn()}
        onTeachProducts={vi.fn()}
        onConnectWhatsApp={vi.fn()}
      />,
    );

    expect(screen.getByText('Vamos comecar')).toBeInTheDocument();
    expect(screen.queryByText('Ensinar o Kloel')).not.toBeInTheDocument();
  });
});
