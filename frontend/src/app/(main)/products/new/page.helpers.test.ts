import { describe, expect, it } from 'vitest';

import { validateProductCreateFlow, validateProductCreateStep } from './page.helpers';
import { initialForm } from './types';

describe('validateProductCreateStep', () => {
  it('blocks details step when required fields are missing', () => {
    expect(validateProductCreateStep(initialForm, 1)).toEqual({
      ok: false,
      step: 1,
      message: 'Informe o nome do produto antes de continuar.',
    });

    expect(validateProductCreateStep({ ...initialForm, name: 'Produto' }, 1)).toEqual({
      ok: false,
      step: 1,
      message: 'Informe a descricao do produto antes de continuar.',
    });

    expect(
      validateProductCreateStep(
        { ...initialForm, name: 'Produto', description: 'Descricao completa' },
        1,
      ),
    ).toEqual({
      ok: false,
      step: 1,
      message: 'Selecione uma categoria antes de continuar.',
    });
  });

  it('blocks sales step when required price is missing or invalid', () => {
    const validDetailsForm = {
      ...initialForm,
      name: 'Produto',
      description: 'Descricao completa',
      category: 'Cursos Online',
    };

    expect(validateProductCreateStep(validDetailsForm, 2)).toEqual({
      ok: false,
      step: 2,
      message: 'Informe o preco do produto antes de continuar.',
    });

    expect(validateProductCreateStep({ ...validDetailsForm, price: '-1' }, 2)).toEqual({
      ok: false,
      step: 2,
      message: 'Informe um preco valido antes de continuar.',
    });
  });

  it('allows sales step when required price is valid', () => {
    expect(
      validateProductCreateStep(
        {
          ...initialForm,
          name: 'Produto',
          description: 'Descricao completa',
          category: 'Cursos Online',
          price: '19.90',
        },
        2,
      ),
    ).toEqual({ ok: true });
  });

  it('blocks affiliate step when enabled without a valid commission percent', () => {
    const sellableForm = {
      ...initialForm,
      name: 'Produto',
      description: 'Descricao completa',
      category: 'Cursos Online',
      price: '19.90',
      affiliatesEnabled: true,
    };

    expect(validateProductCreateStep(sellableForm, 5)).toEqual({
      ok: false,
      step: 5,
      message: 'Informe a comissao do afiliado antes de continuar.',
    });

    expect(
      validateProductCreateStep({ ...sellableForm, affiliateCommissionPercent: '0' }, 5),
    ).toEqual({
      ok: false,
      step: 5,
      message: 'Informe uma comissao de afiliado valida entre 1 e 100.',
    });

    expect(
      validateProductCreateStep({ ...sellableForm, affiliateCommissionPercent: '101' }, 5),
    ).toEqual({
      ok: false,
      step: 5,
      message: 'Informe uma comissao de afiliado valida entre 1 e 100.',
    });
  });

  it('allows affiliate step when enabled with a valid commission percent', () => {
    expect(
      validateProductCreateStep(
        {
          ...initialForm,
          name: 'Produto',
          description: 'Descricao completa',
          category: 'Cursos Online',
          price: '19.90',
          affiliatesEnabled: true,
          affiliateCommissionPercent: '15',
        },
        5,
      ),
    ).toEqual({ ok: true });
  });

  it('allows details step when required fields are present', () => {
    expect(
      validateProductCreateStep(
        {
          ...initialForm,
          name: 'Produto',
          description: 'Descricao completa',
          category: 'Cursos Online',
        },
        1,
      ),
    ).toEqual({ ok: true });
  });

  it('returns the first invalid step when validating the full product flow', () => {
    expect(
      validateProductCreateFlow(
        {
          ...initialForm,
          name: 'Produto',
          description: 'Descricao completa',
          category: 'Cursos Online',
          price: '19.90',
          affiliatesEnabled: true,
        },
        [1, 2, 5, 6, 7],
      ),
    ).toEqual({
      ok: false,
      step: 5,
      message: 'Informe a comissao do afiliado antes de continuar.',
    });
  });
});
