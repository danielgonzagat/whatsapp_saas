import type { CheckoutExperienceForm } from './checkout-experience-social-helpers';
import { EMPTY_CHECKOUT_EXPERIENCE_FORM } from './checkout-experience-social-helpers';

export const CHECKOUT_FORM_DRAFT_VERSION = 1;

export type CheckoutFormDraft = {
  version: number;
  savedAt: string;
  form: CheckoutExperienceForm;
  payMethod: 'card' | 'pix' | 'boleto';
  qty: number;
  couponCode: string;
};

export function buildCheckoutFormDraftKey(
  slug?: string,
  checkoutCode?: string,
  planId?: string,
): string {
  return `kloel:checkout-form-draft:${slug || checkoutCode || planId || 'public'}`;
}

export function sanitizeCheckoutFormDraft(form: CheckoutExperienceForm): CheckoutExperienceForm {
  return {
    ...form,
    cardNumber: '',
    cardExp: '',
    cardCvv: '',
  };
}

export function readCheckoutFormDraft(raw: string | null): CheckoutFormDraft | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<CheckoutFormDraft>;
    if (parsed.version !== CHECKOUT_FORM_DRAFT_VERSION || !parsed.form) {
      return null;
    }
    return {
      version: CHECKOUT_FORM_DRAFT_VERSION,
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date().toISOString(),
      form: sanitizeCheckoutFormDraft({
        ...EMPTY_CHECKOUT_EXPERIENCE_FORM,
        ...parsed.form,
      }),
      payMethod:
        parsed.payMethod === 'pix' || parsed.payMethod === 'boleto' ? parsed.payMethod : 'card',
      qty: Math.max(1, Number(parsed.qty || 1)),
      couponCode: typeof parsed.couponCode === 'string' ? parsed.couponCode : '',
    };
  } catch {
    return null;
  }
}
