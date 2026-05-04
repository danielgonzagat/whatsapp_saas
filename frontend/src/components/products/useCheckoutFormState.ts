'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  CheckoutFormState,
  createDefaultCheckoutForm,
  Checkout,
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

function saveCheckoutFormDraft(draft: ProductCheckoutFormDraft): void {
  try {
    localStorage.setItem(draft.version ? buildCheckoutFormDraftKey(draft.productId) : '', JSON.stringify(draft));
  } catch {
    // Silent fail on localStorage quota exceeded
  }
}

interface CheckoutFormStateHook {
  form: CheckoutFormState;
  showModal: boolean;
  editingCheckoutId: string | null;
  setForm: (form: CheckoutFormState) => void;
  setShowModal: (show: boolean) => void;
  setEditingCheckoutId: (id: string | null) => void;
  resetForm: () => void;
}

export function useCheckoutFormState(productId: string): CheckoutFormStateHook {
  const [form, setForm] = useState<CheckoutFormState>(createDefaultCheckoutForm());
  const [showModal, setShowModal] = useState(false);
  const [editingCheckoutId, setEditingCheckoutId] = useState<string | null>(null);

  const draftKey = buildCheckoutFormDraftKey(productId);

  useEffect(() => {
    const saved = localStorage.getItem(draftKey);
    const draft = readCheckoutFormDraft(saved, productId);
    if (draft) {
      setForm(draft.form);
      setShowModal(draft.showModal);
      setEditingCheckoutId(draft.editingCheckoutId);
    }
  }, [productId, draftKey]);

  const handleSetForm = useCallback(
    (newForm: CheckoutFormState) => {
      setForm(newForm);
      saveCheckoutFormDraft({
        version: CHECKOUT_FORM_DRAFT_VERSION,
        productId,
        savedAt: new Date().toISOString(),
        form: newForm,
        editingCheckoutId,
        showModal,
      });
    },
    [productId, editingCheckoutId, showModal],
  );

  const handleResetForm = useCallback(() => {
    const defaultForm = createDefaultCheckoutForm();
    handleSetForm(defaultForm);
  }, [handleSetForm]);

  return {
    form,
    showModal,
    editingCheckoutId,
    setForm: handleSetForm,
    setShowModal,
    setEditingCheckoutId,
    resetForm: handleResetForm,
  };
}
