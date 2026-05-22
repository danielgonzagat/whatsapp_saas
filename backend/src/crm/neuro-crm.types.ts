export const PRECO_PRE_O_VALOR_QUANT_RE =
  /(preco|preço|valor|quanto|pix|boleto|comprar|fechar|pagar)/i;
export const RECLAMA_RUIM_PROBLEMA_C_RE = /(reclama|ruim|problema|cancel|demora|erro)/i;

export type PurchaseProbabilityBucket = 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
export type SentimentBucket = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
export type IntentBucket = 'BUY' | 'SUPPORT' | 'COMPLAINT' | 'INFO' | 'COLD';

export interface RawAnalysis {
  leadScore?: unknown;
  score?: unknown;
  purchaseProbability?: unknown;
  urgency?: unknown;
  purchaseProbabilityScore?: unknown;
  sentiment?: unknown;
  intent?: unknown;
  summary?: unknown;
  nextBestAction?: unknown;
  cluster?: unknown;
  reasons?: unknown;
}

export interface AnalysisContact {
  name?: string | null;
  phone: string;
  leadScore?: number | null;
  sentiment?: string | null;
  messages: Array<{ direction: string; content: string | null; createdAt: Date }>;
}

export interface AnalysisResult {
  leadScore: number;
  purchaseProbability: PurchaseProbabilityBucket;
  purchaseProbabilityScore: number;
  sentiment: SentimentBucket;
  intent: IntentBucket;
  summary: string;
  nextBestAction: string;
  cluster: string | null;
  reasons: string[];
}
