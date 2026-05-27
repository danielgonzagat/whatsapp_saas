import { NON_DIGIT_RE } from '../common/phone';
import { safeStr } from '../common/string';

export { NON_DIGIT_RE, safeStr };

export function asUnknownRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function detectBuyIntent(message: string): 'high' | 'medium' | 'low' | 'objection' {
  const lowerMessage = message.toLowerCase();
  const highIntentKeywords = [
    'quero comprar',
    'vou comprar',
    'pode enviar',
    'manda o link',
    'aceito',
    'fechado',
    'como pago',
    'pix',
    'cartão',
    'boleto',
    'quero esse',
    'vou levar',
    'me envia',
    'pode mandar',
  ];
  const mediumIntentKeywords = [
    'quanto custa',
    'qual o valor',
    'tem desconto',
    'parcelado',
    'como funciona',
    'me conta mais',
    'interessado',
    'gostei',
  ];
  const objectionKeywords = [
    'tá caro',
    'muito caro',
    'não tenho',
    'vou pensar',
    'depois',
    'não sei',
    'não posso',
    'não quero',
    'sem interesse',
  ];
  for (const kw of highIntentKeywords) {
    if (lowerMessage.includes(kw)) {
      return 'high';
    }
  }
  for (const kw of mediumIntentKeywords) {
    if (lowerMessage.includes(kw)) {
      return 'medium';
    }
  }
  for (const kw of objectionKeywords) {
    if (lowerMessage.includes(kw)) {
      return 'objection';
    }
  }
  return 'low';
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
