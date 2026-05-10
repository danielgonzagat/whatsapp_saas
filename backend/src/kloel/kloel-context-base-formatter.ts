import { buildProductAIConfigPrompt } from './kloel.prompts';
import type { KloelContextFormatterLimits } from './kloel-context-formatter.types';

const S_RE = /\s+/g;

export class KloelContextBaseFormatter {
  constructor(protected readonly limits: KloelContextFormatterLimits) {}

  private safeStr(v: unknown, fb = ''): string {
    return typeof v === 'string'
      ? v
      : typeof v === 'number' || typeof v === 'boolean'
        ? String(v)
        : fb;
  }

  sanitizeUserNameForAssistant(value: string | null | undefined): string {
    const normalized = String(value || '')
      .replace(S_RE, ' ')
      .trim();
    if (!normalized) {
      return 'Usuário';
    }
    const [firstName = normalized] = normalized.split(' ');
    return firstName || 'Usuário';
  }

  formatPromptCurrency(value: unknown, currency: unknown = 'BRL'): string {
    const amount = Number(value);
    if (!Number.isFinite(amount)) {
      return 'valor não informado';
    }
    const currencyStr = typeof currency === 'string' && currency ? currency : 'BRL';
    try {
      return amount.toLocaleString('pt-BR', {
        style: 'currency',
        currency: currencyStr,
      });
    } catch {
      return amount.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      });
    }
  }

  formatPromptPercent(value: unknown, fractionDigits = 1): string | null {
    const amount = Number(value);
    if (!Number.isFinite(amount)) {
      return null;
    }
    return `${amount.toFixed(fractionDigits)}%`;
  }

  formatPromptDate(value: unknown, options?: Intl.DateTimeFormatOptions): string | null {
    if (!value) {
      return null;
    }
    const date = value instanceof Date ? value : new Date(this.safeStr(value));
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeZone: 'America/Sao_Paulo',
      ...options,
    }).format(date);
  }

  truncatePromptText(value: unknown, maxLength = 240): string {
    const normalized = this.safeStr(value).replace(S_RE, ' ').trim();
    if (!normalized) {
      return '';
    }
    if (normalized.length <= maxLength) {
      return normalized;
    }
    return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
  }

  compactJsonForPrompt(value: unknown, maxLength = 240): string | null {
    if (value == null) {
      return null;
    }
    if (typeof value === 'string') {
      const normalized = this.truncatePromptText(value, maxLength);
      return normalized || null;
    }
    try {
      const serialized = JSON.stringify(value);
      const normalized = this.truncatePromptText(serialized, maxLength);
      return normalized || null;
    } catch {
      return null;
    }
  }
}
