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

/** Product_ia_copy. */
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

/** Tone_options. */
export const TONE_OPTIONS = [
  kloelT(`Consultivo`),
  kloelT(`Agressivo`),
  kloelT(`Amigavel`),
  kloelT(`Urgente`),
] as const;

/** Follow_up_options. */
export const FOLLOW_UP_OPTIONS = [
  kloelT(`2h, 24h, 72h`),
  kloelT(`1h, 12h, 48h`),
  kloelT(`Desativado`),
] as const;

/** Create default ai config. */
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

function normalizeObjections(payload?: AIConfigPayload['objections']) {
  if (payload === undefined) {
    return [];
  }
  if (!Array.isArray(payload)) {
    throw new Error('Payload de objecoes invalido.');
  }
  return payload.map((objection) => {
    if (typeof objection?.q !== 'string' || typeof objection?.a !== 'string') {
      throw new Error('Payload de objecoes invalido.');
    }
    return objection;
  });
}

/** Merge ai config payload. */
export function mergeAIConfigPayload(prev: AIConfig, payload: AIConfigPayload): AIConfig {
  const customerProfile = buildCustomerProfile(payload.customerProfile);
  const salesArguments = buildSalesArguments(payload.salesArguments);
  const objections = normalizeObjections(payload.objections);
  return {
    ...prev,
    idealCustomer: customerProfile.idealCustomer,
    painPoints: customerProfile.painPoints,
    promisedResult: customerProfile.promisedResult,
    objections,
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

/** Lower bound for persistence slider value. */
export const PERSISTENCE_MIN = 1;
/** Upper bound for persistence slider value. */
export const PERSISTENCE_MAX = 5;
/** Lower bound for message-limit numeric input. */
export const MESSAGE_LIMIT_MIN = 0;

/**
 * Clamp persistence to the inclusive [1, 5] range, falling back to 3 when
 * NaN / non-finite. Returns an integer.
 */
export function clampPersistence(raw: unknown, fallback = 3): number {
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  const truncated = Math.trunc(num);
  if (truncated < PERSISTENCE_MIN) {
    return PERSISTENCE_MIN;
  }
  if (truncated > PERSISTENCE_MAX) {
    return PERSISTENCE_MAX;
  }
  return truncated;
}

/**
 * Clamp message-limit to a non-negative integer, falling back to 10 when
 * NaN / non-finite.
 */
export function clampMessageLimit(raw: unknown, fallback = 10): number {
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  const truncated = Math.trunc(num);
  return truncated < MESSAGE_LIMIT_MIN ? MESSAGE_LIMIT_MIN : truncated;
}

/**
 * Stable React key for an objection row. Combines a trimmed question + answer
 * with the row index so duplicate empty rows still get unique keys.
 */
export function getObjectionKey(o: { q: string; a: string }, index: number): string {
  return `objection-${index}-${o.q.trim()}-${o.a.trim()}`;
}

/**
 * Immutable update of a single objection field at `index`. Returns the original
 * list unchanged when the index is out of bounds.
 */
export function setObjectionFieldAt(
  list: ReadonlyArray<{ q: string; a: string }>,
  index: number,
  field: 'q' | 'a',
  value: string,
): Array<{ q: string; a: string }> {
  if (index < 0 || index >= list.length) {
    return list.slice();
  }
  const next = list.slice();
  next[index] = { ...next[index], [field]: value };
  return next;
}

/** Append an empty objection row to the end of the list (immutable). */
export function appendEmptyObjection(
  list: ReadonlyArray<{ q: string; a: string }>,
): Array<{ q: string; a: string }> {
  return [...list, { q: '', a: '' }];
}

/**
 * Derive the save-button label from the (saved, saving) state machine.
 *
 * - `saved`   -> success copy (overrides saving so the "✓ saved" flash wins)
 * - `saving`  -> saving copy
 * - otherwise -> idle copy
 */
export function getSaveButtonLabel(
  saved: boolean,
  saving: boolean,
  copy: { saveSuccess: string; saveSaving: string; saveIdle: string } = PRODUCT_IA_COPY,
): string {
  if (saved) {
    return copy.saveSuccess;
  }
  if (saving) {
    return copy.saveSaving;
  }
  return copy.saveIdle;
}

/**
 * SWR cache-key predicate: should this key be revalidated after saving the
 * AI config? Matches every key that begins with `/products`.
 */
export function isProductsCacheKey(key: unknown): boolean {
  return typeof key === 'string' && key.startsWith('/products');
}
