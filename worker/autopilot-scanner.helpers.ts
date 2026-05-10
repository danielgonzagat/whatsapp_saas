import { Prisma } from '@prisma/client';
import { prisma } from './db';
import { WorkerLogger } from './logger';
import { autopilotDecisionCounter } from './metrics';
import { PlanLimitsProvider } from './providers/plan-limits';
import { forEachSequential } from './utils/async-sequence';
import { getErrorMessage } from './utils/error-message';

const log = new WorkerLogger('autopilot-scanner');

const JSON_RE = /```json/g;
const PATTERN_RE = /```/g;
const PRE__VALOR_CUSTA_PIX_BO_RE = /(preç|valor|custa|pix|boleto|pag|assin|compr|checkout|fechar)/i;

export type JsonObject = Record<string, Prisma.JsonValue>;

export type AutopilotDecision = {
  intent: string;
  action: string;
  reason?: string;
};

export type AutopilotSettings = {
  openai?: { apiKey?: string | null } | null;
  autonomy?: { mode?: string | null } | null;
  autopilot?: { enabled?: boolean | null } | null;
  providerSettings?: { calendarLink?: string | null } | null;
  calendarLink?: string | null;
  [key: string]: unknown;
};

export type AutopilotContact = {
  tags?: ReadonlyArray<{ name: string }> | null;
};

export function isPlainJsonObject(value: Prisma.JsonValue | null | undefined): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function asJsonObject(value: Prisma.JsonValue | null | undefined): JsonObject {
  return isPlainJsonObject(value) ? (value as JsonObject) : {};
}

export function jsonDateMillis(value: Prisma.JsonValue | undefined): number {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return 0;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function asNestedObject(value: Prisma.JsonValue | undefined): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function asNestedString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function parseAutopilotSettings(raw: Prisma.JsonValue | null | undefined): AutopilotSettings {
  const base = asJsonObject(raw);
  const openai = asNestedObject(base.openai);
  const autonomy = asNestedObject(base.autonomy);
  const autopilot = asNestedObject(base.autopilot);
  const providerSettings = asNestedObject(base.providerSettings);

  const parsed: AutopilotSettings = {
    openai: openai ? { apiKey: asNestedString(openai.apiKey) } : null,
    autonomy: autonomy ? { mode: asNestedString(autonomy.mode) } : null,
    autopilot: autopilot
      ? { enabled: typeof autopilot.enabled === 'boolean' ? autopilot.enabled : null }
      : null,
    providerSettings: providerSettings
      ? { calendarLink: asNestedString(providerSettings.calendarLink) }
      : null,
    calendarLink: asNestedString(base.calendarLink),
  };

  for (const [key, value] of Object.entries(base)) {
    if (!(key in parsed)) {
      parsed[key] = value;
    }
  }

  return parsed;
}

const bestHourCache = new Map<string, { hour: number; ts: number }>();
const BEST_HOUR_CACHE_MAX = 500;

export async function computeBestHour(workspaceId: string): Promise<number> {
  const cache = bestHourCache.get(workspaceId);
  if (cache && Date.now() - cache.ts < 10 * 60 * 1000) {
    return cache.hour;
  }

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const msgs = await prisma.message.findMany({
    where: { workspaceId, createdAt: { gte: since } },
    select: { createdAt: true },
  });

  const buckets: number[] = new Array<number>(24).fill(0);
  msgs.forEach((m) => {
    buckets[m.createdAt.getHours()]++;
  });
  let best = 10;
  let bestVal = -1;
  buckets.forEach((v: number, idx: number) => {
    if (v > bestVal) {
      bestVal = v;
      best = idx;
    }
  });
  if (bestHourCache.size >= BEST_HOUR_CACHE_MAX) {
    const oldestKey = bestHourCache.keys().next().value;
    if (oldestKey) {
      bestHourCache.delete(oldestKey);
    }
  }
  bestHourCache.set(workspaceId, { hour: best, ts: Date.now() });
  return best;
}

export function hasKeyword(text: string, ...keys: string[]) {
  const lower = text.toLowerCase();
  return keys.some((k) => lower.includes(k));
}

type KeywordRule = {
  readonly keywords: readonly string[];
  readonly decision: AutopilotDecision;
};

const KEYWORD_RULES: readonly KeywordRule[] = [
  {
    keywords: ['quanto custa', 'preco', 'preço', 'valor', 'preco?'],
    decision: { intent: 'BUYING', action: 'SEND_PRICE', reason: 'price_question' },
  },
  {
    keywords: ['quero', 'comprar', 'fechar', 'vamos', 'contratar', 'assinar'],
    decision: { intent: 'BUYING', action: 'SEND_OFFER', reason: 'buy_signal' },
  },
  {
    keywords: ['pix', 'boleto', 'pagar', 'pagamento', 'checkout', 'link de pagamento'],
    decision: { intent: 'BUYING', action: 'SEND_OFFER', reason: 'payment_intent' },
  },
  {
    keywords: ['agendar', 'agenda', 'calend', 'marcar', 'reuni', 'call'],
    decision: { intent: 'SCHEDULING', action: 'SEND_CALENDAR', reason: 'schedule' },
  },
  {
    keywords: ['problema', 'erro', 'bug', 'não funciona', 'nao funciona', 'suporte'],
    decision: { intent: 'SUPPORT', action: 'TRANSFER_AGENT', reason: 'support' },
  },
  {
    keywords: ['caro', 'muito caro', 'sem dinheiro', 'agora não', 'agora nao', 'talvez depois'],
    decision: { intent: 'OBJECTION', action: 'HANDLE_OBJECTION', reason: 'price_objection' },
  },
  {
    keywords: ['cancel', 'cancelar', 'desistir', 'parar', 'não quero mais', 'nao quero mais'],
    decision: { intent: 'CHURN_RISK', action: 'ANTI_CHURN', reason: 'churn_risk' },
  },
  {
    keywords: ['já uso', 'ja uso', 'sou cliente', 'renovar', 'upgrade', 'plano maior'],
    decision: { intent: 'UPSELL', action: 'UPSELL', reason: 'existing_customer' },
  },
];

export function classifyByKeywords(text: string): AutopilotDecision | null {
  for (const rule of KEYWORD_RULES) {
    if (hasKeyword(text, ...rule.keywords)) {
      return rule.decision;
    }
  }
  return null;
}

export function isAutonomyActive(settings: AutopilotSettings): boolean {
  const mode = String(settings?.autonomy?.mode || '').toUpperCase();
  if (['LIVE', 'BACKLOG', 'FULL'].includes(mode)) {
    return true;
  }
  if (['OFF', 'HUMAN_ONLY', 'SUSPENDED'].includes(mode)) {
    return false;
  }
  return settings?.autopilot?.enabled === true;
}

export async function ensureOptInAllowed(
  _workspaceId: string,
  contact: AutopilotContact | null | undefined,
): Promise<void> {
  const enforce = process.env.ENFORCE_OPTIN === 'true';
  if (!enforce) {
    return;
  }

  const tags = contact?.tags ?? [];
  const hasOptIn = tags.some((t) => t.name === 'optin_whatsapp');
  if (!hasOptIn) {
    throw new Error('optin_required');
  }
}
