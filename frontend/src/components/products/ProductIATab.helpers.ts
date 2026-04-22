import { kloelT } from '@/lib/i18n/t';

// Pure helpers extracted from ProductIATab.tsx to reduce cyclomatic complexity
// on the host component's fetch effect. Behaviour is byte-identical to the
// original inline implementation.

export interface AIConfig {
  /** Ideal customer property. */
  idealCustomer?: string;
  /** Pain points property. */
  painPoints?: string;
  /** Promised result property. */
  promisedResult?: string;
  /** Objections property. */
  objections?: Array<{ q: string; a: string }>;
  /** Tone property. */
  tone?: string;
  /** Persistence property. */
  persistence?: number;
  /** Message limit property. */
  messageLimit?: number;
  /** Follow up property. */
  followUp?: string;
  /** Auto checkout link property. */
  autoCheckoutLink?: boolean;
  /** Offer discount property. */
  offerDiscount?: boolean;
  /** Use urgency property. */
  useUrgency?: boolean;
}

/** Ai config payload shape. */
export interface AIConfigPayload {
  /** Customer profile property. */
  customerProfile?: {
    idealCustomer?: string;
    painPoints?: string;
    promisedResult?: string;
  };
  /** Objections property. */
  objections?: Array<{ q: string; a: string }>;
  /** Tone property. */
  tone?: string;
  /** Persistence level property. */
  persistenceLevel?: number;
  /** Message limit property. */
  messageLimit?: number;
  /** Follow up config property. */
  followUpConfig?: { schedule?: string };
  /** Sales arguments property. */
  salesArguments?: {
    autoCheckoutLink?: boolean;
    offerDiscount?: boolean;
    useUrgency?: boolean;
  };
}

export const PRODUCT_IA_COPY = {
  loadError: kloelT(`Nao foi possivel carregar a configuracao da IA.`),
  idealCustomerPlaceholder: kloelT(`Mulheres 35-55 anos, preocupadas com envelhecimento...`),
  painPointsPlaceholder: kloelT(`Rugas, manchas, flacidez...`),
  promisedResultPlaceholder: kloelT(`Pele rejuvenescida em 30 dias...`),
  objectionInputAria: kloelT(`Objecao do cliente`),
  objectionInputPlaceholder: kloelT(`Objecao do cliente...`),
  objectionResponseAria: kloelT(`Resposta da IA`),
  objectionResponsePlaceholder: kloelT(`Resposta da IA...`),
  persistenceInputAria: kloelT(`Persistencia de 1 a 5`),
  messageLimitInputAria: kloelT(`Limite de mensagens`),
  saveButtonAria: kloelT(`Salvar configuracoes da IA`),
  addObjection: kloelT(`+ Adicionar objecao`),
  saveIdle: kloelT(`Salvar config da IA`),
  saveSaving: kloelT(`Salvando...`),
  saveSuccess: kloelT(`IA atualizada!`),
} as const;

export const TONE_OPTIONS = [
  kloelT(`Consultivo`),
  kloelT(`Agressivo`),
  kloelT(`Amigavel`),
  kloelT(`Urgente`),
] as const;

export const FOLLOW_UP_OPTIONS = [
  kloelT(`2h, 24h, 72h`),
  kloelT(`1h, 12h, 48h`),
  kloelT(`Desativado`),
] as const;

export function createDefaultAIConfig(): AIConfig {
  return {
    objections: [],
    tone: 'Consultivo',
    persistence: 3,
    messageLimit: 10,
    followUp: '2h, 24h, 72h',
    autoCheckoutLink: true,
    offerDiscount: true,
    useUrgency: true,
  };
}

function buildCustomerProfile(payload?: AIConfigPayload['customerProfile']) {
  return {
    idealCustomer: payload?.idealCustomer || '',
    painPoints: payload?.painPoints || '',
    promisedResult: payload?.promisedResult || '',
  };
}

function buildSalesArguments(payload?: AIConfigPayload['salesArguments']) {
  return {
    autoCheckoutLink: payload?.autoCheckoutLink ?? true,
    offerDiscount: payload?.offerDiscount ?? true,
    useUrgency: payload?.useUrgency ?? true,
  };
}

/** Merge ai config payload. */
export function mergeAIConfigPayload(prev: AIConfig, payload: AIConfigPayload): AIConfig {
  const customerProfile = buildCustomerProfile(payload.customerProfile);
  const salesArguments = buildSalesArguments(payload.salesArguments);
  return {
    ...prev,
    idealCustomer: customerProfile.idealCustomer,
    painPoints: customerProfile.painPoints,
    promisedResult: customerProfile.promisedResult,
    objections: payload.objections || [],
    tone: payload.tone || 'Consultivo',
    persistence: payload.persistenceLevel ?? 3,
    messageLimit: payload.messageLimit ?? 10,
    followUp: payload.followUpConfig?.schedule || '2h, 24h, 72h',
    autoCheckoutLink: salesArguments.autoCheckoutLink,
    offerDiscount: salesArguments.offerDiscount,
    useUrgency: salesArguments.useUrgency,
  };
}

function buildAIConfigCustomerProfile(config: AIConfig) {
  if (!config.idealCustomer) {
    return undefined;
  }

  return {
    idealCustomer: config.idealCustomer,
    painPoints: config.painPoints,
    promisedResult: config.promisedResult,
  };
}

function buildAIConfigSalesArguments(config: AIConfig) {
  return {
    autoCheckoutLink: config.autoCheckoutLink,
    offerDiscount: config.offerDiscount,
    useUrgency: config.useUrgency,
  };
}

/** Build ai config body. */
export function buildAIConfigBody(config: AIConfig): Record<string, unknown> {
  const customerProfile = buildAIConfigCustomerProfile(config);
  const followUpConfig = config.followUp ? { schedule: config.followUp } : undefined;
  return {
    customerProfile,
    objections: config.objections,
    tone: config.tone,
    persistenceLevel: config.persistence,
    messageLimit: config.messageLimit,
    followUpConfig,
    salesArguments: buildAIConfigSalesArguments(config),
  };
}
