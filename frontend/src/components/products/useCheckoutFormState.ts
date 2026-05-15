'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  CheckoutFormState,
  createDefaultCheckoutForm,
} from '@/components/products/ProductCheckoutsTab.helpers';

const CHECKOUT_FORM_DRAFT_VERSION = 1;

type ProductCheckoutFormDraft = {
  version: number;
  productId: string;
  savedAt: string;
  form: CheckoutFormState;
  editingCheckoutId: string | null;
  showModal: boolean;
};

function buildCheckoutFormDraftKey(productId: string): string {
  return `kloel:product-checkout-form-draft:${productId}`;
}

function readCheckoutFormDraft(
  raw: string | null,
  productId: string,
): ProductCheckoutFormDraft | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ProductCheckoutFormDraft>;
    if (
      parsed.version !== CHECKOUT_FORM_DRAFT_VERSION ||
      parsed.productId !== productId ||
      !parsed.form
    ) {
      return null;
    }
    return {
      version: CHECKOUT_FORM_DRAFT_VERSION,
      productId,
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date().toISOString(),
      form: {
        ...createDefaultCheckoutForm(),
        ...parsed.form,
        paymentMethods: Array.isArray(parsed.form.paymentMethods)
          ? parsed.form.paymentMethods
          : createDefaultCheckoutForm().paymentMethods,
      },
      editingCheckoutId:
        typeof parsed.editingCheckoutId === 'string' ? parsed.editingCheckoutId : null,
      showModal: parsed.showModal === true,
    };
  } catch {
    return null;
  }
}

function readInitialDraft(productId: string): ProductCheckoutFormDraft | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const key = buildCheckoutFormDraftKey(productId);
  return readCheckoutFormDraft(localStorage.getItem(key), productId);
}

interface CheckoutFormStateHook {
  form: CheckoutFormState;
  showModal: boolean;
  editingCheckoutId: string | null;
  draftKey: string;
  setForm: (form: CheckoutFormState) => void;
  setShowModal: (show: boolean) => void;
  setEditingCheckoutId: (id: string | null) => void;
  resetForm: () => void;
  clearDraft: () => void;
}

export function useCheckoutFormState(productId: string): CheckoutFormStateHook {
  const [form, setForm] = useState<CheckoutFormState>(() => {
    const draft = readInitialDraft(productId);
    return draft ? draft.form : createDefaultCheckoutForm();
  });

  const [showModal, setShowModal] = useState(() => {
    const draft = readInitialDraft(productId);
    return draft ? draft.showModal : false;
  });

  const [editingCheckoutId, setEditingCheckoutId] = useState<string | null>(() => {
    const draft = readInitialDraft(productId);
    return draft ? draft.editingCheckoutId : null;
  });

  const draftKey = buildCheckoutFormDraftKey(productId);

  useEffect(() => {
    const draft = readInitialDraft(productId);
    if (draft) {
      setForm(draft.form);
      setShowModal(draft.showModal);
      setEditingCheckoutId(draft.editingCheckoutId);
      return;
    }
    setForm(createDefaultCheckoutForm());
    setShowModal(false);
    setEditingCheckoutId(null);
  }, [productId]);

  useEffect(() => {
    if (typeof window === 'undefined' || !showModal) {
      return;
    }
    try {
      const payload: ProductCheckoutFormDraft = {
        version: CHECKOUT_FORM_DRAFT_VERSION,
        productId,
        savedAt: new Date().toISOString(),
        form,
        editingCheckoutId,
        showModal,
      };
      localStorage.setItem(draftKey, JSON.stringify(payload));
    } catch {
      // Silent fail on localStorage quota exceeded
    }
  }, [draftKey, form, editingCheckoutId, showModal, productId]);

  const handleSetForm = useCallback((newForm: CheckoutFormState) => {
    setForm(newForm);
  }, []);

  const handleResetForm = useCallback(() => {
    handleSetForm(createDefaultCheckoutForm());
    setEditingCheckoutId(null);
  }, [handleSetForm]);

  const clearDraft = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      localStorage.removeItem(draftKey);
    } catch {
      // Silent fail
    }
  }, [draftKey]);

  return {
    form,
    showModal,
    editingCheckoutId,
    draftKey,
    setForm: handleSetForm,
    setShowModal,
    setEditingCheckoutId,
    resetForm: handleResetForm,
    clearDraft,
  };
}
