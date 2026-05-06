import type {
  CheckoutDisplayTestimonial,
  PublicCheckoutConfig,
  PublicCheckoutMerchantInfo,
  PublicCheckoutThemeProps,
} from '@/lib/public-checkout-contract';

export type Formatters = {
  cpf: (value: string) => string;
  phone: (value: string) => string;
  cep: (value: string) => string;
  card: (value: string) => string;
  exp: (value: string) => string;
  brl: (cents: number) => string;
};

export type CheckoutExperienceFormState = {
  name: string;
  email: string;
  cpf: string;
  phone: string;
  cep: string;
  street: string;
  number: string;
  neighborhood: string;
  complement: string;
  city: string;
  state: string;
  destinatario: string;
  cardNumber: string;
  cardExp: string;
  cardCvv: string;
  cardName: string;
  cardCpf: string;
  installments: string;
};

export type CheckoutFormDraft = {
  version: number;
  savedAt: string;
  form: CheckoutExperienceFormState;
  payMethod: 'card' | 'pix' | 'boleto';
  qty: number;
  couponCode: string;
};

export type UseCheckoutExperienceOptions = PublicCheckoutThemeProps & {
  defaults: {
    product: {
      name: string;
      priceInCents: number;
      brand: string;
    };
    testimonials: CheckoutDisplayTestimonial[];
  };
  helpers: {
    fmt: Formatters;
    normalizeTestimonials: (
      brandName: string,
      testimonials: PublicCheckoutConfig['testimonials'],
      enabled: boolean | undefined,
    ) => CheckoutDisplayTestimonial[];
    buildFooterPrimaryLine: (brandName: string, merchant?: PublicCheckoutMerchantInfo) => string;
    formatCnpj: (value?: string | null) => string;
  };
};

export type ShippingMode = 'FREE' | 'FIXED' | 'VARIABLE' | string;

export type PreflightContext = {
  validateStep1: () => boolean;
  validateStep2: () => boolean;
  workspaceId: string | undefined;
  planId: string | undefined;
  checkoutUnavailableReason: string;
  payMethod: 'card' | 'pix' | 'boleto';
  supportsCard: boolean;
  supportsPix: boolean;
  supportsBoleto: boolean;
  cpf: string;
};

export type PreflightOutcome = { error: string; step?: 1 | 2 } | null;

export type StringSetter = (value: string) => void;
export type BooleanSetter = (value: boolean) => void;

export type CouponPopupTimerParams = {
  eligible: boolean;
  couponApplied: boolean;
  couponPopupHandled: boolean;
  popupCouponCode: string;
  delay: number | undefined;
  setCouponCode: StringSetter;
  setCouponError: StringSetter;
  setShowCouponPopup: BooleanSetter;
};

export type VariableShippingParams = {
  shippingMode: ShippingMode;
  cep: string;
  slug: string | undefined;
  variableShippingFloorInCents: number;
  setDynamicShippingInCents: (v: number | null) => void;
  setDynamicShippingLoading: (v: boolean) => void;
};
