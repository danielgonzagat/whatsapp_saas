const U0300__U036F_RE = /[\u0300-\u036f]/g;
const A_Z0_9_S_RE = /[^a-z0-9\s-]/g;
const S_RE = /\s+/g;
const PATTERN_RE = /-+/g;
const A_ZA_Z___0_9_RE = /[A-Za-zÀ-ÿ0-9-]+/g;
const HTTPS_________S_RE = /https?:\/\/[^\s)]+/gi;
const R___S____D_1_3_RE = /(?:R\$\s*)?\d{1,3}(?:\.\d{3})*(?:,\d{2})|(?:R\$\s*)?\d+(?:,\d{2})?/g;
const R___S_RE = /R\$\s*/gi;
const PATTERN_RE_2 = /\./g;
const B__D_1_2__________D_RE = /\b(\d{1,2})(?:[.,]\d+)?\s*%/g;
const D_RE = /[^\d.,]/g;
const B__D_1_2___S_X_B_RE = /\b(\d{1,2})\s*x\b/gi;
const D_RE_2 = /[^\d]/g;
const A_Z0_9___3_RE = /^[A-Z0-9-]{3,}$/;
const R__N_RE = /\r?\n+/;
const BUYING_SIGNALS = [
  'preco',
  'preço',
  'valor',
  'quanto',
  'quero',
  'queria',
  'gostaria',
  'comprar',
  'fechar',
  'parcelado',
  'parcelar',
  'pix',
  'boleto',
  'cartao',
  'cartão',
  'link',
  'pagamento',
  'pagar',
  'tem',
  'vende',
  'trabalha',
  'sobre',
];

const PRODUCT_CUE_WORDS = new Set([
  'quero',
  'queria',
  'gostaria',
  'comprar',
  'sobre',
  'tem',
  'vende',
  'trabalha',
  'oferece',
  'produto',
  'tratamento',
  'procedimento',
  'solucao',
  'solução',
  'kit',
  'combo',
]);

const STOPWORDS = new Set([
  'o',
  'a',
  'os',
  'as',
  'de',
  'do',
  'da',
  'dos',
  'das',
  'um',
  'uma',
  'uns',
  'umas',
  'e',
  'ou',
  'pra',
  'para',
  'com',
  'sem',
  'me',
  'te',
  'sobre',
  'isso',
  'esse',
  'essa',
  'qual',
  'quais',
  'quanto',
  'quero',
  'queria',
  'gostaria',
  'comprar',
  'tem',
  'vende',
  'trabalha',
  'oferece',
  'preco',
  'preço',
  'valor',
  'pix',
  'boleto',
  'cartao',
  'cartão',
  'link',
  'pagamento',
  'pagar',
  'parcelado',
  'parcelar',
  'mais',
  'melhor',
  'funciona',
  'como',
  'quiser',
  'aqui',
  'agora',
]);

/** Catalog gap detection shape. */
export interface CatalogGapDetection {
  /** Buying intent property. */
  buyingIntent: boolean;
  /** Matched products property. */
  matchedProducts: string[];
  /** Missing product name property. */
  missingProductName: string | null;
}

/** Parsed offer line shape. */
export interface ParsedOfferLine {
  /** Raw property. */
  raw: string;
  /** Title property. */
  title: string;
  /** Price property. */
  price: number | null;
  /** Url property. */
  url: string | null;
}

/** Normalize catalog text. */
export function normalizeCatalogText(value: string): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(U0300__U036F_RE, '')
    .replace(A_Z0_9_S_RE, ' ')
    .replace(S_RE, ' ')
    .trim();
}

/** Slugify catalog key. */
export function slugifyCatalogKey(value: string): string {
  return normalizeCatalogText(value).replace(S_RE, '-').replace(PATTERN_RE, '-').slice(0, 80);
}

/** Find product matches. */
export function findProductMatches(messageContent: string, productNames: string[]): string[] {
  const normalizedMessage = normalizeCatalogText(messageContent);
  if (!normalizedMessage) {
    return [];
  }

  return Array.from(
    new Set(
      productNames.filter((name) => {
        const normalizedName = normalizeCatalogText(name);
        return normalizedName.length > 1 && normalizedMessage.includes(normalizedName);
      }),
    ),
  );
}

function findUppercaseProductToken(rawTokens: readonly string[]): string | null {
  for (const token of rawTokens) {
    if (A_Z0_9___3_RE.test(token) && !STOPWORDS.has(normalizeCatalogText(token))) {
      return token.toUpperCase();
    }
  }
  return null;
}

function collectCandidateAfterCueWord(rawTokens: readonly string[], startIndex: number): string[] {
  const candidate: string[] = [];
  for (let cursor = startIndex; cursor < rawTokens.length; cursor += 1) {
    const token = rawTokens[cursor];
    const normalized = normalizeCatalogText(token);
    if (!normalized || STOPWORDS.has(normalized)) {
      if (candidate.length > 0) {
        break;
      }
      continue;
    }
    candidate.push(token);
    if (candidate.length >= 3) {
      break;
    }
  }
  return candidate;
}

function findCandidateFromCueWord(rawTokens: readonly string[]): string | null {
  const normalizedTokens = rawTokens.map((token) => normalizeCatalogText(token));
  for (let index = 0; index < normalizedTokens.length; index += 1) {
    if (!PRODUCT_CUE_WORDS.has(normalizedTokens[index])) {
      continue;
    }
    const candidate = collectCandidateAfterCueWord(rawTokens, index + 1);
    if (candidate.length > 0) {
      return candidate.join(' ').trim();
    }
  }
  return null;
}

function fallbackFromRawTokens(rawTokens: readonly string[]): string | null {
  const fallback = rawTokens
    .filter((token) => !STOPWORDS.has(normalizeCatalogText(token)))
    .slice(0, 3)
    .join(' ')
    .trim();
  return fallback || null;
}

function tokenizeCandidateMessage(messageContent: string): string[] {
  const raw = String(messageContent ?? '');
  const matches = raw.match(A_ZA_Z___0_9_RE);
  if (!matches) {
    return [];
  }
  return matches.filter(Boolean);
}

/** Extract missing product candidate. */
export function extractMissingProductCandidate(messageContent: string): string | null {
  const rawTokens = tokenizeCandidateMessage(messageContent);
  if (!rawTokens.length) {
    return null;
  }

  const upperHit = findUppercaseProductToken(rawTokens);
  if (upperHit) {
    return upperHit;
  }

  const cueHit = findCandidateFromCueWord(rawTokens);
  if (cueHit) {
    return cueHit;
  }

  return fallbackFromRawTokens(rawTokens);
}

/** Detect catalog gap. */
export function detectCatalogGap(params: {
  messageContent: string;
  productNames: string[];
}): CatalogGapDetection {
  const messageContent = String(params.messageContent || '').trim();
  const normalizedMessage = normalizeCatalogText(messageContent);
  const matchedProducts = findProductMatches(messageContent, params.productNames);
  const buyingIntent = BUYING_SIGNALS.some((keyword) => normalizedMessage.includes(keyword));

  return {
    buyingIntent,
    matchedProducts,
    missingProductName:
      matchedProducts.length === 0 && buyingIntent
        ? extractMissingProductCandidate(messageContent)
        : null,
  };
}

/** Extract urls. */
export function extractUrls(value: string): string[] {
  return Array.from(new Set(String(value || '').match(HTTPS_________S_RE) || []));
}

/** Extract money values. */
export function extractMoneyValues(value: string): number[] {
  const matches = String(value || '').match(R___S____D_1_3_RE) || [];

  return matches
    .map((match) => Number(match.replace(R___S_RE, '').replace(PATTERN_RE_2, '').replace(',', '.')))
    .filter((value) => Number.isFinite(value) && value > 0);
}

/** Extract percentages. */
export function extractPercentages(value: string): number[] {
  const matches = String(value || '').match(B__D_1_2__________D_RE) || [];
  return matches
    .map((match) => Number(match.replace(D_RE, '').replace(',', '.')))
    .filter((value) => Number.isFinite(value) && value >= 0);
}

/** Extract max installments. */
export function extractMaxInstallments(value: string): number | null {
  const matches = String(value || '').match(B__D_1_2___S_X_B_RE) || [];
  const numbers = matches
    .map((match) => Number(match.replace(D_RE_2, '')))
    .filter((value) => Number.isFinite(value) && value > 0);
  return numbers.length > 0 ? Math.max(...numbers) : null;
}

/** Parse offer lines. */
export function parseOfferLines(value: string): ParsedOfferLine[] {
  const lines = String(value || '')
    .split(R__N_RE)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line, index) => {
    const urls = extractUrls(line);
    const prices = extractMoneyValues(line);
    const title = line.replace(HTTPS_________S_RE, '').trim() || `Plano ${index + 1}`;
    return {
      raw: line,
      title,
      price: prices[0] ?? null,
      url: urls[0] ?? null,
    };
  });
}

/** Build product description. */
export function buildProductDescription(params: {
  productName: string;
  descriptionAnswer: string;
  offers: ParsedOfferLine[];
  companyAnswer: string;
}): string {
  const detail = String(params.descriptionAnswer || '').trim();
  const offerSummary =
    params.offers.length > 0
      ? ` Opções comerciais registradas: ${params.offers
          .map((offer) =>
            offer.price ? `${offer.title} por R$ ${offer.price.toFixed(2)}` : offer.title,
          )
          .join('; ')}.`
      : '';
  const companySummary = String(params.companyAnswer || '').trim();

  return [
    `${params.productName} é uma oferta ativa da conta e deve ser tratada como prioridade comercial.`,
    detail,
    offerSummary,
    companySummary ? `Contexto da empresa responsável: ${companySummary}` : '',
  ]
    .filter(Boolean)
    .join(' ')
    .trim();
}

/** Build product faq. */
export function buildProductFaq(params: {
  productName: string;
  descriptionAnswer: string;
  offersAnswer: string;
  companyAnswer: string;
}) {
  const urls = extractUrls(params.offersAnswer);
  const prices = extractMoneyValues(params.offersAnswer);
  const installments = extractMaxInstallments(params.offersAnswer);

  return [
    {
      question: `O que é ${params.productName}?`,
      answer: String(params.descriptionAnswer || '').trim(),
    },
    {
      question: 'Quais opções comerciais estão disponíveis?',
      answer: String(params.offersAnswer || '').trim(),
    },
    {
      question: 'Como faço para comprar?',
      answer:
        urls.length > 0
          ? `Links disponíveis: ${urls.join(' | ')}`
          : 'A venda pode ser concluída pelo fluxo comercial da conta.',
    },
    {
      question: 'Quais limites de negociação eu posso usar?',
      answer: [
        prices.length > 0
          ? `Valores identificados: ${prices.map((value) => `R$ ${value.toFixed(2)}`).join(', ')}`
          : '',
        installments ? `Parcelamento máximo identificado: ${installments}x.` : '',
      ]
        .filter(Boolean)
        .join(' '),
    },
    {
      question: 'Quem é a empresa responsável por essa oferta?',
      answer: String(params.companyAnswer || '').trim(),
    },
  ].filter((item) => item.answer);
}
