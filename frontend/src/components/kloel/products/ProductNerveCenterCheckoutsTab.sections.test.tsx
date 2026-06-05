import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  ColorPickerField,
  PaymentCheckboxes,
} from './ProductNerveCenterCheckoutsTab.sections';
import { useCheckoutConfigForm } from './ProductNerveCenterCheckoutsTab.hooks';

describe('ProductNerveCenterCheckoutsTab sections', () => {
  it('renders payment checkboxes with stable form identities', () => {
    render(
      <PaymentCheckboxes
        ckLocal={{ enableCreditCard: true, enablePix: true, enableBoleto: false }}
        patch={vi.fn()}
      />,
    );

    const creditCard = screen.getByLabelText('Cartão de crédito') as HTMLInputElement;
    const pix = screen.getByLabelText('Pix') as HTMLInputElement;
    const boleto = screen.getByLabelText('Boleto') as HTMLInputElement;

    expect(creditCard.id).toBe('checkout-cartao-de-credito-enableCreditCard');
    expect(creditCard.name).toBe('checkoutCartaoDeCreditoEnableCreditCard');
    expect(pix.id).toBe('checkout-pix-enablePix');
    expect(pix.name).toBe('checkoutPixEnablePix');
    expect(boleto.id).toBe('checkout-boleto-enableBoleto');
    expect(boleto.name).toBe('checkoutBoletoEnableBoleto');
  });

  it('normalizes color swatch and text values to editable hex', () => {
    render(
      <ColorPickerField
        label="Cor principal"
        value="rgb(232, 93, 48)"
        placeholder="#000000"
        onChange={vi.fn()}
      />,
    );

    const swatch = screen.getByLabelText('Cor principal seletor') as HTMLInputElement;
    const text = screen.getByLabelText('Cor principal') as HTMLInputElement;

    expect(swatch.id).toBe('checkout-cor-principal-color');
    expect(swatch.name).toBe('checkoutCorPrincipalColor');
    expect(swatch.value).toBe('#e85d30');
    expect(text.id).toBe('checkout-cor-principal-text');
    expect(text.name).toBe('checkoutCorPrincipalText');
    expect(text.value).toBe('#e85d30');
  });

  it('keeps partial hex text editable while typing a checkout color', () => {
    function EditableColorField() {
      const [color, setColor] = useState('var(--text-silver, rgb(224, 221, 216))');

      return (
        <ColorPickerField
          label="Cor fundo"
          value={color}
          placeholder="#0a0a0c"
          onChange={setColor}
        />
      );
    }

    render(<EditableColorField />);

    const text = screen.getByLabelText('Cor fundo') as HTMLInputElement;

    expect(text.value).toBe('#e0ddd8');

    fireEvent.change(text, { target: { value: '#' } });
    expect(text.value).toBe('#');

    fireEvent.change(text, { target: { value: '#0a' } });
    expect(text.value).toBe('#0a');

    fireEvent.change(text, { target: { value: '#0a0a0c' } });
    expect(text.value).toBe('#0a0a0c');
  });
});

describe('useCheckoutConfigForm', () => {
  it('blocks empty required checkout names before persistence', async () => {
    const saveCkCfg = vi.fn().mockResolvedValue(undefined);
    const syncCheckoutLinks = vi.fn().mockResolvedValue(undefined);
    const updatePlan = vi.fn().mockResolvedValue(undefined);
    const showToast = vi.fn();
    const setCkEdit = vi.fn();

    const ckCfg = { brandName: 'Checkout Principal' };
    const rawCheckouts = [
      { id: 'checkout-1', name: 'Checkout Principal', checkoutLinks: [{ planId: 'plan-1' }] },
    ];
    const rawPlans = [{ id: 'plan-1', name: 'Plano Auditoria' }];

    const { result } = renderHook(() =>
      useCheckoutConfigForm(
        'checkout-1',
        ckCfg,
        rawCheckouts,
        rawPlans,
        saveCkCfg,
        syncCheckoutLinks,
        updatePlan,
        showToast,
        setCkEdit,
      ),
    );

    act(() => {
      result.current.patch('brandName', '   ');
    });

    let didSave = true;
    await act(async () => {
      didSave = await result.current.handleSave();
    });

    expect(didSave).toBe(false);
    expect(result.current.ckError).toBe('Informe o nome/descrição do checkout antes de salvar.');
    expect(showToast).toHaveBeenCalledWith(
      'Informe o nome/descrição do checkout antes de salvar.',
      'error',
    );
    expect(saveCkCfg).not.toHaveBeenCalled();
    expect(syncCheckoutLinks).not.toHaveBeenCalled();
    expect(updatePlan).not.toHaveBeenCalled();
    expect(setCkEdit).not.toHaveBeenCalled();
  });

  it('tracks visual edits and saves normalized checkout colors', async () => {
    const saveCkCfg = vi.fn().mockResolvedValue(undefined);
    const syncCheckoutLinks = vi.fn().mockResolvedValue(undefined);
    const updatePlan = vi.fn().mockResolvedValue(undefined);
    const showToast = vi.fn();
    const setCkEdit = vi.fn();

    const ckCfg = {
      brandName: 'Checkout Principal',
      accentColor: 'rgb(232, 93, 48)',
      backgroundColor: 'var(--text-silver, rgb(224, 221, 216))',
      btnFinalizeText: 'Finalizar compra',
      theme: 'BLANC',
      enableTestimonials: true,
      enableGuarantee: true,
      showCouponPopup: false,
    };
    const rawCheckouts = [{ id: 'checkout-1', name: 'Checkout Principal', checkoutLinks: [] }];
    const rawPlans: Array<{ id: string; name: string }> = [];

    const { result } = renderHook(() =>
      useCheckoutConfigForm(
        'checkout-1',
        ckCfg,
        rawCheckouts,
        rawPlans,
        saveCkCfg,
        syncCheckoutLinks,
        updatePlan,
        showToast,
        setCkEdit,
      ),
    );

    expect(result.current.hasUnsavedChanges).toBe(false);

    act(() => {
      result.current.patch('backgroundColor', '#0a0a0c');
    });

    expect(result.current.hasUnsavedChanges).toBe(true);

    await act(async () => {
      await result.current.handleSave();
    });

    expect(saveCkCfg).toHaveBeenCalledWith(
      expect.objectContaining({
        brandName: 'Checkout Principal',
        accentColor: '#e85d30',
        backgroundColor: '#0a0a0c',
      }),
    );
  });
});
