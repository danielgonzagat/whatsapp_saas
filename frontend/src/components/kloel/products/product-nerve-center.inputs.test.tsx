import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  CurrencyStepperField,
  IntegerStepperField,
  PercentStepperField,
  SelectField,
} from './product-nerve-center.inputs';

function expectIdentifiableField(field: HTMLElement, expectedName: string) {
  expect(field.getAttribute('id')).toMatch(/^product-nerve-/);
  expect(field.getAttribute('name')).toBe(expectedName);
}

describe('product nerve center field inputs', () => {
  it('renders stepper inputs as identifiable form fields', () => {
    render(
      <>
        <IntegerStepperField label="Garantia (dias)" value={7} onChange={vi.fn()} />
        <CurrencyStepperField label="Valor (R$)" cents={9700} onChange={vi.fn()} />
        <PercentStepperField label="Comissão (%)" value="30" onChange={vi.fn()} />
      </>,
    );

    expectIdentifiableField(screen.getByLabelText('Garantia (dias)'), 'productNerveGarantiaDias');
    expectIdentifiableField(screen.getByLabelText('Valor (R$)'), 'productNerveValorR');
    expectIdentifiableField(screen.getByLabelText('Comissão (%)'), 'productNerveComissao');
    expect(screen.getByRole('button', { name: 'Aumentar Garantia (dias)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Diminuir Garantia (dias)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Aumentar Valor (R$)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Diminuir Valor (R$)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Aumentar Comissão (%)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Diminuir Comissão (%)' })).toBeTruthy();
  });

  it('renders select controls as identifiable form fields', () => {
    render(
      <SelectField
        label="Formato"
        value="DIGITAL"
        onChange={vi.fn()}
        options={[{ value: 'DIGITAL', label: 'Digital' }]}
      />,
    );

    expectIdentifiableField(screen.getByLabelText('Formato'), 'productNerveFormato');
  });
});
