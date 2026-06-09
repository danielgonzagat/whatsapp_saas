import { fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import NewProductPage from './page';
import {
  buildProductCreatePayload,
  mergeProductTags,
  validateProductCreateFlow,
  validateProductCreateStep,
} from './page.helpers';
import { initialForm } from './types';

const pageMocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  clearPreview: vi.fn(),
  mutate: vi.fn(),
  push: vi.fn(),
  readFileAsDataUrl: vi.fn(),
  setPreviewUrl: vi.fn(),
  showToast: vi.fn(),
  uploadGenericMedia: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pageMocks.push }),
}));

vi.mock('@/components/kloel/ToastProvider', () => ({
  useToast: () => ({ showToast: pageMocks.showToast }),
}));

vi.mock('@/hooks/usePersistentImagePreview', () => ({
  usePersistentImagePreview: () => ({
    previewUrl: null,
    clearPreview: pageMocks.clearPreview,
    setPreviewUrl: pageMocks.setPreviewUrl,
  }),
}));

vi.mock('@/hooks/useWorkspaceId', () => ({
  useWorkspaceId: () => 'workspace-e2e',
}));

vi.mock('@/hooks/useProducts', () => ({
  useProductCategories: () => ({
    categories: ['Cursos Online'],
    isLoading: false,
    error: null,
  }),
}));

vi.mock('@/lib/api', () => ({ apiFetch: pageMocks.apiFetch }));

vi.mock('@/lib/media-upload', () => ({
  readFileAsDataUrl: pageMocks.readFileAsDataUrl,
  uploadGenericMedia: pageMocks.uploadGenericMedia,
}));

vi.mock('swr', () => ({ mutate: pageMocks.mutate }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('mergeProductTags', () => {
  it('promotes comma-separated pending input into unique tags without exceeding the limit', () => {
    expect(mergeProductTags(['qa'], ' auditoria, QA, produto , ,extra,final', 4)).toEqual([
      'qa',
      'auditoria',
      'produto',
      'extra',
    ]);
  });
});

describe('buildProductCreatePayload', () => {
  it('preserves cents from localized decimal inputs', () => {
    const payload = buildProductCreatePayload(
      {
        ...initialForm,
        name: 'Produto decimal',
        description: 'Descricao completa',
        category: 'Software e SaaS',
        price: '197,90',
        affiliateCommission: '30,5',
        affiliatesEnabled: true,
        affiliateCommissionPercent: '35,5',
      },
      'workspace-qa',
      false,
    );

    expect(payload.price).toBe(197.9);
    expect(payload.affiliateCommission).toBe(30.5);
    expect(payload.affiliateCommissionPercent).toBe(35.5);
    expect(payload.status).toBe('PENDING');
  });

  it('preserves localized physical package decimals', () => {
    const payload = buildProductCreatePayload(
      {
        ...initialForm,
        name: 'Produto fisico decimal',
        description: 'Descricao completa',
        category: 'Software e SaaS',
        price: '197,90',
        packageType: 'Caixa',
        width: '10,5',
        height: '5,25',
        depth: '12,75',
        weight: '0,3',
      },
      'workspace-qa',
      true,
    );

    expect(payload.width).toBe(10.5);
    expect(payload.height).toBe(5.25);
    expect(payload.depth).toBe(12.75);
    expect(payload.weight).toBe(0.3);
  });
});

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

  it('blocks physical package step when required logistics details are missing or invalid', () => {
    expect(validateProductCreateStep({ ...initialForm, format: 'PHYSICAL' }, 3)).toEqual({
      ok: false,
      step: 3,
      message: 'Informe o tipo de embalagem antes de continuar.',
    });

    expect(
      validateProductCreateStep(
        { ...initialForm, format: 'PHYSICAL', packageType: 'Caixa', width: '10', height: '0', depth: '5' },
        3,
      ),
    ).toEqual({
      ok: false,
      step: 3,
      message: 'Informe dimensoes validas da embalagem antes de continuar.',
    });

    expect(
      validateProductCreateStep(
        {
          ...initialForm,
          format: 'PHYSICAL',
          packageType: 'Caixa',
          width: '10',
          height: '5',
          depth: '5',
          weight: '0',
        },
        3,
      ),
    ).toEqual({
      ok: false,
      step: 3,
      message: 'Informe um peso valido da embalagem antes de continuar.',
    });
  });

  it('blocks physical delivery step without dispatch time or carrier coverage', () => {
    expect(
      validateProductCreateStep(
        { ...initialForm, format: 'PHYSICAL', dispatchTime: '', carriers: ['SEDEX'] },
        4,
      ),
    ).toEqual({
      ok: false,
      step: 4,
      message: 'Informe o prazo de postagem antes de continuar.',
    });

    expect(
      validateProductCreateStep({ ...initialForm, format: 'PHYSICAL', dispatchTime: '3', carriers: [] }, 4),
    ).toEqual({
      ok: false,
      step: 4,
      message: 'Selecione ao menos uma transportadora antes de continuar.',
    });

    expect(
      validateProductCreateStep(
        { ...initialForm, format: 'PHYSICAL', dispatchTime: '3', carriers: ['SEDEX'] },
        4,
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

describe('NewProductPage validation feedback', () => {
  it('keeps the validation failure visible inside the wizard when required details are missing', () => {
    render(createElement(NewProductPage));

    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));

    expect(screen.getByRole('alert').textContent).toContain(
      'Informe o nome do produto antes de continuar.',
    );
    expect(pageMocks.showToast).toHaveBeenCalledWith(
      'Informe o nome do produto antes de continuar.',
      'error',
    );
  });

  it('clears the local image preview and shows feedback when upload fails', async () => {
    pageMocks.readFileAsDataUrl.mockResolvedValueOnce('data:image/png;base64,audit');
    pageMocks.uploadGenericMedia.mockRejectedValueOnce(new Error('upload offline'));

    render(createElement(NewProductPage));

    fireEvent.change(screen.getByLabelText('Imagem do produto'), {
      target: { files: [new File(['cover'], 'cover.png', { type: 'image/png' })] },
    });

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Nao foi possivel enviar a imagem do produto.',
    );
    expect(pageMocks.setPreviewUrl).toHaveBeenCalledWith('data:image/png;base64,audit');
    expect(pageMocks.clearPreview).toHaveBeenCalled();
    expect(pageMocks.showToast).toHaveBeenCalledWith(
      'Nao foi possivel enviar a imagem do produto.',
      'error',
    );
  });
});
