import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCheckoutFormState } from './useCheckoutFormState';

const productId = 'prod-123';

function dummyForm() {
  return {
    name: 'Test Checkout',
    paymentMethods: ['PIX'],
    active: true,
  };
}

describe('useCheckoutFormState', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('returns default form state on initial mount', () => {
    const { result } = renderHook(() => useCheckoutFormState(productId));
    expect(result.current.form.name).toBe('');
    expect(result.current.form.paymentMethods).toEqual(['PIX', 'CARTAO']);
    expect(result.current.form.active).toBe(true);
    expect(result.current.showModal).toBe(false);
    expect(result.current.editingCheckoutId).toBeNull();
  });

  it('updates form via setForm', () => {
    const { result } = renderHook(() => useCheckoutFormState(productId));
    act(() => {
      result.current.setForm(dummyForm());
    });
    expect(result.current.form.name).toBe('Test Checkout');
    expect(result.current.form.paymentMethods).toEqual(['PIX']);
  });

  it('saves draft to localStorage when showModal is true', async () => {
    const { result } = renderHook(() => useCheckoutFormState(productId));
    act(() => {
      result.current.setShowModal(true);
    });
    act(() => {
      result.current.setForm(dummyForm());
    });
    await vi.waitFor(() => {
      const key = `kloel:product-checkout-form-draft:${productId}`;
      const raw = localStorage.getItem(key);
      expect(raw).not.toBeNull();
      const draft = JSON.parse(raw!);
      expect(draft.form.name).toBe('Test Checkout');
      expect(draft.showModal).toBe(true);
    });
  });

  it('does NOT save draft to localStorage when showModal is false', () => {
    const { result } = renderHook(() => useCheckoutFormState(productId));
    act(() => {
      result.current.setForm(dummyForm());
    });
    const key = `kloel:product-checkout-form-draft:${productId}`;
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('restores draft from localStorage on mount', () => {
    const key = `kloel:product-checkout-form-draft:${productId}`;
    const draft = {
      version: 1,
      productId,
      savedAt: new Date().toISOString(),
      form: { name: 'Saved Form', paymentMethods: ['CARTAO'], active: false },
      editingCheckoutId: 'checkout-1',
      showModal: true,
    };
    localStorage.setItem(key, JSON.stringify(draft));

    const { result } = renderHook(() => useCheckoutFormState(productId));
    expect(result.current.form.name).toBe('Saved Form');
    expect(result.current.form.paymentMethods).toEqual(['CARTAO']);
    expect(result.current.form.active).toBe(false);
    expect(result.current.editingCheckoutId).toBe('checkout-1');
    expect(result.current.showModal).toBe(true);
  });

  it('loads the matching draft when productId changes', async () => {
    const nextProductId = 'prod-456';
    localStorage.setItem(
      `kloel:product-checkout-form-draft:${productId}`,
      JSON.stringify({
        version: 1,
        productId,
        savedAt: new Date().toISOString(),
        form: { name: 'Original Product', paymentMethods: ['PIX'], active: true },
        editingCheckoutId: 'checkout-original',
        showModal: true,
      }),
    );
    localStorage.setItem(
      `kloel:product-checkout-form-draft:${nextProductId}`,
      JSON.stringify({
        version: 1,
        productId: nextProductId,
        savedAt: new Date().toISOString(),
        form: { name: 'Next Product', paymentMethods: ['CARTAO'], active: false },
        editingCheckoutId: 'checkout-next',
        showModal: true,
      }),
    );

    const { result, rerender } = renderHook(
      ({ currentProductId }) => useCheckoutFormState(currentProductId),
      { initialProps: { currentProductId: productId } },
    );

    expect(result.current.form.name).toBe('Original Product');

    rerender({ currentProductId: nextProductId });

    await vi.waitFor(() => {
      expect(result.current.form.name).toBe('Next Product');
      expect(result.current.form.paymentMethods).toEqual(['CARTAO']);
      expect(result.current.editingCheckoutId).toBe('checkout-next');
      expect(result.current.draftKey).toBe(`kloel:product-checkout-form-draft:${nextProductId}`);
    });
  });

  it('ignores draft with wrong version', () => {
    const key = `kloel:product-checkout-form-draft:${productId}`;
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 2,
        productId,
        form: { name: 'Stale', paymentMethods: [], active: false },
      }),
    );

    const { result } = renderHook(() => useCheckoutFormState(productId));
    expect(result.current.form.name).toBe('');
  });

  it('ignores draft with wrong productId', () => {
    const key = `kloel:product-checkout-form-draft:${productId}`;
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        productId: 'other-prod',
        form: { name: 'Wrong', paymentMethods: [], active: false },
      }),
    );

    const { result } = renderHook(() => useCheckoutFormState(productId));
    expect(result.current.form.name).toBe('');
  });

  it('resets form to defaults via resetForm', () => {
    const { result } = renderHook(() => useCheckoutFormState(productId));
    act(() => {
      result.current.setForm(dummyForm());
    });
    act(() => {
      result.current.resetForm();
    });
    expect(result.current.form.name).toBe('');
    expect(result.current.form.paymentMethods).toEqual(['PIX', 'CARTAO']);
    expect(result.current.form.active).toBe(true);
  });

  it('clearDraft removes the localStorage key', () => {
    const key = `kloel:product-checkout-form-draft:${productId}`;
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        productId,
        form: dummyForm(),
        editingCheckoutId: null,
        showModal: true,
      }),
    );

    const { result } = renderHook(() => useCheckoutFormState(productId));
    act(() => {
      result.current.clearDraft();
    });
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('showModal and editingCheckoutId setters work', () => {
    const { result } = renderHook(() => useCheckoutFormState(productId));
    act(() => {
      result.current.setShowModal(true);
    });
    expect(result.current.showModal).toBe(true);
    act(() => {
      result.current.setEditingCheckoutId('checkout-2');
    });
    expect(result.current.editingCheckoutId).toBe('checkout-2');
  });

  it('exposes draftKey', () => {
    const { result } = renderHook(() => useCheckoutFormState(productId));
    expect(result.current.draftKey).toBe(`kloel:product-checkout-form-draft:${productId}`);
  });

  it('survives malformed localStorage JSON', () => {
    const key = `kloel:product-checkout-form-draft:${productId}`;
    localStorage.setItem(key, '{broken');

    const { result } = renderHook(() => useCheckoutFormState(productId));
    expect(result.current.form.name).toBe('');
  });
});
