import type { MarketSignal } from './commercial-intelligence.types';
import { normalized, includesAny } from './commercial-intelligence.core';

const PRODUCT_TERMS = [
  'produto',
  'comprar',
  'preço',
  'preco',
  'valor',
  'kit',
  'combo',
  'plano',
  'assinatura',
];

type MessageSignalHit = { signalType: string; normalizedKey: string };

const MESSAGE_SIGNAL_RULES: Array<{
  signalType: string;
  normalizedKey: string;
  keywords: string[];
}> = [
  {
    signalType: 'TRACKING',
    normalizedKey: 'tracking_confidence',
    keywords: ['rastreio', 'codigo', 'código', 'entrega'],
  },
  {
    signalType: 'PRICE_RESISTANCE',
    normalizedKey: 'price_resistance',
    keywords: ['preco', 'preço', 'valor', 'caro', 'desconto', 'quanto', 'custa'],
  },
  {
    signalType: 'PAYMENT_FLEXIBILITY',
    normalizedKey: 'payment_flexibility',
    keywords: ['parcel', 'boleto', 'pix', 'cartao', 'cartão'],
  },
  {
    signalType: 'BUNDLE_DEMAND',
    normalizedKey: 'bundle_demand',
    keywords: ['kit', 'combo', '3 unidades', '5 unidades'],
  },
];

function detectMessageSignals(text: string): MessageSignalHit[] {
  const hits: MessageSignalHit[] = [];
  for (const rule of MESSAGE_SIGNAL_RULES) {
    if (includesAny(text, rule.keywords)) {
      hits.push({ signalType: rule.signalType, normalizedKey: rule.normalizedKey });
    }
  }
  for (const product of PRODUCT_TERMS) {
    if (text.includes(product)) {
      hits.push({ signalType: 'PRODUCT_DEMAND', normalizedKey: `product:${product}` });
    }
  }
  return hits;
}

function createMarketSignalRegistrar(signalMap: Map<string, MarketSignal>) {
  return (signalType: string, normalizedKey: string, text: string) => {
    const current = signalMap.get(normalizedKey) || {
      signalType,
      normalizedKey,
      frequency: 0,
      examples: [],
    };
    current.frequency += 1;
    if (text && current.examples.length < 3 && !current.examples.includes(text)) {
      current.examples.push(text);
    }
    signalMap.set(normalizedKey, current);
  };
}

/** Extract market signals. */
export function extractMarketSignals(messages: Array<string | null | undefined>) {
  const signalMap = new Map<string, MarketSignal>();
  const registerSignal = createMarketSignalRegistrar(signalMap);

  for (const rawMessage of messages) {
    const text = normalized(rawMessage);
    if (!text) {
      continue;
    }
    for (const hit of detectMessageSignals(text)) {
      registerSignal(hit.signalType, hit.normalizedKey, text);
    }
  }

  return [...signalMap.values()].sort((a, b) => b.frequency - a.frequency);
}
