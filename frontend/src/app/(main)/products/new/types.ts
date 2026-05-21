export interface FormState {
  name: string;
  description: string;
  category: string;
  tags: string[];
  format: 'PHYSICAL' | 'DIGITAL' | 'HYBRID';
  imageUrl: string;
  price: string;
  paymentType: 'ONE_TIME' | 'SUBSCRIPTION' | 'INSTALLMENT';
  affiliateCommission: string;
  salesPageUrl: string;
  guaranteeDays: string;
  checkoutType: 'standard' | 'conversational';
  facebookPixelId: string;
  googleTagManagerId: string;
  packageType: string;
  width: string;
  height: string;
  depth: string;
  weight: string;
  shippingResponsible: 'producer' | 'supplier' | 'fulfillment' | 'dropshipping';
  dispatchTime: string;
  carriers: string[];
  affiliatesEnabled: boolean;
  affiliateCommissionPercent: string;
  affiliateApprovalMode: 'auto' | 'manual';
  billingType: 'one_time' | 'recurring' | 'free';
  maxInstallments: string;
  interestFreeInstallments: string;
}

export const STEPS = [
  { id: 1, label: 'Detalhes' },
  { id: 2, label: 'Vendas' },
  { id: 3, label: 'Embalagem' },
  { id: 4, label: 'Entrega' },
  { id: 5, label: 'Afiliacao' },
  { id: 6, label: 'Pagamento' },
  { id: 7, label: 'Revisao' },
] as const;

export const GUARANTEE_OPTIONS = [
  { value: '7', label: '7 dias' },
  { value: '15', label: '15 dias' },
  { value: '30', label: '30 dias' },
  { value: '60', label: '60 dias' },
  { value: '90', label: '90 dias' },
];

export const PACKAGE_TYPES = ['Caixa', 'Envelope', 'Tubo', 'Sacola', 'Palete', 'Outro'];

export const DISPATCH_TIMES = [
  { value: '1', label: '1 dia util' },
  { value: '2', label: '2 dias uteis' },
  { value: '3', label: '3 dias uteis' },
  { value: '5', label: '5 dias uteis' },
  { value: '7', label: '7 dias uteis' },
  { value: '10', label: '10 dias uteis' },
  { value: '15', label: '15 dias uteis' },
];

export const CARRIERS = [
  'Correios PAC',
  'SEDEX',
  'Jadlog',
  'Loggi',
  'Total Express',
  'Azul Cargo',
  'Latam Cargo',
  'Sequoia',
  'Kangu',
  'Melhor Envio',
  'Transportadora Local',
];

export const PAYMENT_TYPE_OPTIONS = [
  { value: 'ONE_TIME' as const, label: 'Avista', desc: 'Pagamento unico' },
  { value: 'SUBSCRIPTION' as const, label: 'Assinatura', desc: 'Cobranca recorrente' },
  { value: 'INSTALLMENT' as const, label: 'Parcelado', desc: 'Dividido em parcelas' },
];

export const CHECKOUT_TYPE_OPTIONS = [
  { value: 'standard' as const, label: 'Standard', desc: 'Checkout tradicional' },
  { value: 'conversational' as const, label: 'Conversacional', desc: 'Via WhatsApp com IA' },
];

export const SHIPPING_RESPONSIBLE_OPTIONS = [
  { value: 'producer' as const, label: 'Produtor', desc: 'Voce mesmo envia' },
  { value: 'supplier' as const, label: 'Fornecedor', desc: 'Seu fornecedor envia' },
  { value: 'fulfillment' as const, label: 'Fulfillment', desc: 'Centro de distribuicao' },
  { value: 'dropshipping' as const, label: 'Dropshipping', desc: 'Envio direto ao cliente' },
];

export const APPROVAL_MODE_OPTIONS = [
  { value: 'auto' as const, label: 'Automatico', desc: 'Aprovacao instantanea' },
  { value: 'manual' as const, label: 'Manual', desc: 'Voce aprova cada solicitacao' },
];

export const BILLING_TYPE_OPTIONS = [
  { value: 'one_time' as const, label: 'Unico', desc: 'Uma cobranca' },
  { value: 'recurring' as const, label: 'Recorrente', desc: 'Assinatura mensal' },
  { value: 'free' as const, label: 'Gratuito', desc: 'Sem cobranca' },
];

export const initialForm: FormState = {
  name: '',
  description: '',
  category: '',
  tags: [],
  format: 'PHYSICAL',
  imageUrl: '',
  price: '',
  paymentType: 'ONE_TIME',
  affiliateCommission: '',
  salesPageUrl: '',
  guaranteeDays: '30',
  checkoutType: 'standard',
  facebookPixelId: '',
  googleTagManagerId: '',
  packageType: '',
  width: '',
  height: '',
  depth: '',
  weight: '',
  shippingResponsible: 'producer',
  dispatchTime: '3',
  carriers: [],
  affiliatesEnabled: false,
  affiliateCommissionPercent: '',
  affiliateApprovalMode: 'auto',
  billingType: 'one_time',
  maxInstallments: '12',
  interestFreeInstallments: '1',
};

export const FORMAT_LABEL_MAP: Record<FormState['format'], string> = {
  PHYSICAL: 'Fisico',
  DIGITAL: 'Digital',
  HYBRID: 'Hibrido',
};

export const PAYMENT_TYPE_LABEL_MAP: Record<FormState['paymentType'], string> = {
  ONE_TIME: 'Avista',
  SUBSCRIPTION: 'Assinatura',
  INSTALLMENT: 'Parcelado',
};

export const SHIPPING_RESPONSIBLE_LABEL_MAP: Record<FormState['shippingResponsible'], string> = {
  producer: 'Produtor',
  supplier: 'Fornecedor',
  fulfillment: 'Fulfillment',
  dropshipping: 'Dropshipping',
};

export const BILLING_TYPE_LABEL_MAP: Record<FormState['billingType'], string> = {
  one_time: 'Unico',
  recurring: 'Recorrente',
  free: 'Gratuito',
};

export interface StepCommonProps {
  form: FormState;
  updateForm: (partial: Partial<FormState>) => void;
}
