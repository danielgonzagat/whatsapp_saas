import { kloelT } from '@/lib/i18n/t';

/** Checkout config shape. */
export interface CheckoutConfig {
  /** Payment methods property. */
  paymentMethods?: string[];
  [key: string]: unknown;
}

/** Checkout shape. */
export interface Checkout {
  /** Id property. */
  id: string;
  /** Name property. */
  name: string;
  /** Code property. */
  code: string;
  /** Config property. */
  config: CheckoutConfig;
  /** Unique visits property. */
  uniqueVisits: number;
  /** Total visits property. */
  totalVisits: number;
  /** Abandon rate property. */
  abandonRate: number;
  /** Cancel rate property. */
  cancelRate: number;
  /** Conversion rate property. */
  conversionRate: number;
  /** Active property. */
  active: boolean;
}

/** Checkout form state shape. */
export interface CheckoutFormState {
  /** Name property. */
  name: string;
  /** Payment methods property. */
  paymentMethods: string[];
  /** Active property. */
  active: boolean;
}

const DEFAULT_PAYMENT_METHODS = ['PIX', 'CARTAO'] as const;

/** Checkout_payment_methods. */
export const CHECKOUT_PAYMENT_METHODS = ['BOLETO', 'CARTAO', 'PIX', 'RECEBA_E_PAGUE'] as const;

/** Checkout_tab_copy. */
export const CHECKOUT_TAB_COPY = {
  loadError: kloelT(`Nao foi possivel carregar os checkouts.`),
  saveError: kloelT(`Nao foi possivel salvar o checkout.`),
  deleteError: kloelT(`Nao foi possivel excluir o checkout.`),
  editCheckout: kloelT(`Editar checkout`),
  newCheckout: kloelT(`Novo checkout`),
  saving: kloelT(`Salvando...`),
  saveCheckout: kloelT(`Salvar checkout`),
  createCheckout: kloelT(`Criar checkout`),
  editCheckoutAria: kloelT(`Editar checkout`),
  deleteCheckoutAria: kloelT(`Excluir checkout`),
  closeModalAria: kloelT(`Fechar modal de checkout`),
} as const;

/** To checkout error message. */
export function toCheckoutErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Create default checkout form. */
export function createDefaultCheckoutForm(): CheckoutFormState {
  return {
    name: '',
    paymentMethods: [...DEFAULT_PAYMENT_METHODS],
    active: true,
  };
}

/** Create checkout form. */
export function createCheckoutForm(checkout?: Checkout): CheckoutFormState {
  if (!checkout) {
    return createDefaultCheckoutForm();
  }

  const configuredMethods = Array.isArray(checkout.config?.paymentMethods)
    ? checkout.config.paymentMethods
    : [];

  return {
    name: checkout.name || '',
    paymentMethods: configuredMethods.length > 0 ? configuredMethods : [...DEFAULT_PAYMENT_METHODS],
    active: checkout.active !== false,
  };
}
