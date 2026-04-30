import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import OpenAI from 'openai';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { chatCompletionWithRetry } from '../kloel/openai-wrapper';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import { PrismaService } from '../prisma/prisma.service';

const PRECO_PRE_O_VALOR_QUANT_RE = /(preco|preço|valor|quanto|pix|boleto|comprar|fechar|pagar)/i;
const RECLAMA_RUIM_PROBLEMA_C_RE = /(reclama|ruim|problema|cancel|demora|erro)/i;

type PurchaseProbabilityBucket = 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
type SentimentBucket = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
type IntentBucket = 'BUY' | 'SUPPORT' | 'COMPLAINT' | 'INFO' | 'COLD';

interface RawAnalysis {
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

interface AnalysisContact {
  name?: string | null;
  phone: string;
  leadScore?: number | null;
  sentiment?: string | null;
  messages: Array<{ direction: string; content: string | null; createdAt: Date }>;
}

/** Analysis result shape. */
export interface AnalysisResult {
  /** Lead score property. */
  leadScore: number;
  /** Purchase probability property. */
  purchaseProbability: PurchaseProbabilityBucket;
  /** Purchase probability score property. */
  purchaseProbabilityScore: number;
  /** Sentiment property. */
  sentiment: SentimentBucket;
  /** Intent property. */
  intent: IntentBucket;
  /** Summary property. */
  summary: string;
  /** Next best action property. */
  nextBestAction: string;
  /** Cluster property. */
  cluster: string | null;
  /** Reasons property. */
  reasons: string[];
}

interface ClusterPoint {
  contact: {
    id: string;
    name: string | null;
    phone: string;
    leadScore: number;
    updatedAt: Date;
  };
  x: number;
  y: number;
}

// Coerce an unknown value to a string without triggering
// @typescript-eslint/no-base-to-string. Returns '' for objects/arrays/null
// rather than the misleading "[object Object]" default.
function coerceToString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return '';
}
