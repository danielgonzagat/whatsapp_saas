// Pure helpers extracted from ProductIATab.tsx to reduce cyclomatic complexity
// on the host component's fetch effect. Behaviour is byte-identical to the
// original inline implementation.

export interface AIConfig {
  idealCustomer?: string;
  painPoints?: string;
  promisedResult?: string;
  objections?: Array<{ q: string; a: string }>;
  tone?: string;
  persistence?: number;
  messageLimit?: number;
  followUp?: string;
  autoCheckoutLink?: boolean;
  offerDiscount?: boolean;
  useUrgency?: boolean;
}

/** Ai config payload shape. */
export interface AIConfigPayload {
  customerProfile?: {
    idealCustomer?: string;
    painPoints?: string;
    promisedResult?: string;
  };
  objections?: Array<{ q: string; a: string }>;
  tone?: string;
  persistenceLevel?: number;
  messageLimit?: number;
  followUpConfig?: { schedule?: string };
  salesArguments?: {
    autoCheckoutLink?: boolean;
    offerDiscount?: boolean;
    useUrgency?: boolean;
  };
}

/** Merge ai config payload. */
export function mergeAIConfigPayload(prev: AIConfig, payload: AIConfigPayload): AIConfig {
  const customer = payload.customerProfile;
  const sales = payload.salesArguments;
  return {
    ...prev,
    idealCustomer: customer?.idealCustomer || '',
    painPoints: customer?.painPoints || '',
    promisedResult: customer?.promisedResult || '',
    objections: payload.objections || [],
    tone: payload.tone || 'Consultivo',
    persistence: payload.persistenceLevel ?? 3,
    messageLimit: payload.messageLimit ?? 10,
    followUp: payload.followUpConfig?.schedule || '2h, 24h, 72h',
    autoCheckoutLink: sales?.autoCheckoutLink ?? true,
    offerDiscount: sales?.offerDiscount ?? true,
    useUrgency: sales?.useUrgency ?? true,
  };
}

/** Build ai config body. */
export function buildAIConfigBody(config: AIConfig): Record<string, unknown> {
  const customerProfile = config.idealCustomer
    ? {
        idealCustomer: config.idealCustomer,
        painPoints: config.painPoints,
        promisedResult: config.promisedResult,
      }
    : undefined;
  const followUpConfig = config.followUp ? { schedule: config.followUp } : undefined;
  return {
    customerProfile,
    objections: config.objections,
    tone: config.tone,
    persistenceLevel: config.persistence,
    messageLimit: config.messageLimit,
    followUpConfig,
    salesArguments: {
      autoCheckoutLink: config.autoCheckoutLink,
      offerDiscount: config.offerDiscount,
      useUrgency: config.useUrgency,
    },
  };
}
