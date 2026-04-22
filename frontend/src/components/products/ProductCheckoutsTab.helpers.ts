import { kloelT } from '@/lib/i18n/t';

export interface CheckoutConfig {
  paymentMethods?: string[];
  [key: string]: unknown;
}

export interface Checkout {
  id: string;
  name: string;
  code: string;
  config: CheckoutConfig;
  uniqueVisits: number;
  totalVisits: number;
  abandonRate: number;
  cancelRate: number;
  conversionRate: number;
  active: boolean;
}

export interface CheckoutFormState {
  name: string;
  paymentMethods: string[];
  active: boolean;
}

const DEFAULT_PAYMENT_METHODS = ['PIX', 'CARTAO'] as const;

export const CHECKOUT_PAYMENT_METHODS = ['BOLETO', 'CARTAO', 'PIX', 'RECEBA_E_PAGUE'] as const;

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

export function toCheckoutErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function createDefaultCheckoutForm(): CheckoutFormState {
  return {
    name: '',
    paymentMethods: [...DEFAULT_PAYMENT_METHODS],
    active: true,
  };
}

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
