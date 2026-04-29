import {
  ACCOUNT_AGENT_REGEX,
  BUYING_SIGNALS,
  PRODUCT_CUE_WORDS,
  STOPWORDS,
} from './account-agent.util.helpers';
import { formatBrlAmount } from '../kloel/money-format.util';

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

/**
 * Lower-cases the supplied text and strips diacritics, punctuation and extra whitespace.
 * Used as the canonical normalization step before keyword/product comparisons.
 */
export function normalizeCatalogText(value: string): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(ACCOUNT_AGENT_REGEX.diacritics, '')
    .replace(ACCOUNT_AGENT_REGEX.nonAlphaNumWhitespaceHyphen, ' ')
    .replace(ACCOUNT_AGENT_REGEX.whitespaceRun, ' ')
    .trim();
}

/**
 * Produces a URL-safe slug (max 80 chars) from the supplied catalog string.
 * Whitespace and hyphen runs are collapsed into single hyphens.
 */
export function slugifyCatalogKey(value: string): string {
  return normalizeCatalogText(value)
    .replace(ACCOUNT_AGENT_REGEX.whitespaceRun, '-')
    .replace(ACCOUNT_AGENT_REGEX.hyphenRun, '-')
    .slice(0, 80);
}

/**
 * Returns the unique product names whose normalized form is contained in the message.
 * Names shorter than 2 normalized characters are skipped to avoid trivial matches.
 */
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

/**
 * Returns the first uppercase SKU-like token (e.g. `KIT-3`) found in the input,
 * skipping tokens that normalize into stopwords. Returns null when none qualify.
 */
function findUppercaseProductToken(rawTokens: readonly string[]): string | null {
  for (const token of rawTokens) {
    if (
      ACCOUNT_AGENT_REGEX.uppercaseSku.test(token) &&
      !STOPWORDS.has(normalizeCatalogText(token))
    ) {
      return token.toUpperCase();
    }
  }
  return null;
}

/**
 * Collects up to three meaningful tokens after a cue-word boundary, stopping when a
 * stopword is encountered after at least one candidate has been gathered.
 */
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

/**
 * Walks the token list looking for a known cue word (PRODUCT_CUE_WORDS) and
 * returns the joined window of tokens that follow it.
 */
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

/**
 * Last-resort candidate extractor: keeps the first three non-stopword tokens.
 * Returns null if every token is a stopword.
 */
function fallbackFromRawTokens(rawTokens: readonly string[]): string | null {
  const fallback = rawTokens
    .filter((token) => !STOPWORDS.has(normalizeCatalogText(token)))
    .slice(0, 3)
    .join(' ')
    .trim();
  return fallback || null;
}

/**
 * Tokenizes the message into accent-aware alphanumeric runs.
 * Always returns an array — empty when nothing matches.
 */
function tokenizeCandidateMessage(messageContent: string): string[] {
  const raw = String(messageContent ?? '');
  const matches = raw.match(ACCOUNT_AGENT_REGEX.alphaNumericWord);
  if (!matches) {
    return [];
  }
  return matches.filter(Boolean);
}

/**
 * Best-effort extraction of a product name candidate when the catalog has no
 * explicit match. Tries uppercase SKU detection, cue-word capture, then a
 * generic non-stopword fallback.
 */
export function extractMissingProductCandidate(messageContent: string): string | null {
  const rawTokens = tokenizeCandidateMessage(messageContent);
  if (!rawTokens.length) {
    return null;
  }

  return (
    findUppercaseProductToken(rawTokens) ??
    findCandidateFromCueWord(rawTokens) ??
    fallbackFromRawTokens(rawTokens)
  );
}

/**
 * Detects buying intent and either returns the catalog products mentioned in the
 * message or, when buying intent exists without a match, a candidate name to flag
 * the gap.
 */
export function detectCatalogGap(params: {
  messageContent: string;
  productNames: string[];
}): CatalogGapDetection {
  const messageContent = String(params.messageContent || '').trim();
  const normalizedMessage = normalizeCatalogText(messageContent);
  const matchedProducts = findProductMatches(messageContent, params.productNames);
  const buyingIntent = BUYING_SIGNALS.some((keyword) => normalizedMessage.includes(keyword));
  const missingProductName =
    matchedProducts.length === 0 && buyingIntent
      ? extractMissingProductCandidate(messageContent)
      : null;

  return {
    buyingIntent,
    matchedProducts,
    missingProductName,
  };
}

/** Returns the unique HTTP/HTTPS URLs found in the supplied text. */
export function extractUrls(value: string): string[] {
  return Array.from(new Set(String(value || '').match(ACCOUNT_AGENT_REGEX.url) || []));
}

/** Returns positive monetary values (BR-format) parsed from the supplied text. */
export function extractMoneyValues(value: string): number[] {
  const matches = String(value || '').match(ACCOUNT_AGENT_REGEX.monetary) || [];

  return matches
    .map((match) =>
      Number(
        match
          .replace(ACCOUNT_AGENT_REGEX.currencyPrefix, '')
          .replace(ACCOUNT_AGENT_REGEX.dot, '')
          .replace(',', '.'),
      ),
    )
    .filter((money) => Number.isFinite(money) && money > 0);
}

/** Returns non-negative percentages parsed from the supplied text. */
export function extractPercentages(value: string): number[] {
  const matches = String(value || '').match(ACCOUNT_AGENT_REGEX.percentage) || [];
  return matches
    .map((match) => Number(match.replace(ACCOUNT_AGENT_REGEX.nonNumeric, '').replace(',', '.')))
    .filter((percent) => Number.isFinite(percent) && percent >= 0);
}

/** Returns the highest installment count (e.g. `12x`) declared in the supplied text. */
export function extractMaxInstallments(value: string): number | null {
  const matches = String(value || '').match(ACCOUNT_AGENT_REGEX.installment) || [];
  const numbers = matches
    .map((match) => Number(match.replace(ACCOUNT_AGENT_REGEX.nonDigit, '')))
    .filter((count) => Number.isFinite(count) && count > 0);
  return numbers.length > 0 ? Math.max(...numbers) : null;
}

/**
 * Splits the supplied multi-line text into structured offer lines, extracting the
 * first URL and price from each line. Empty lines are dropped; remaining lines
 * receive a synthetic title (`Plano N`) when only a URL was present.
 */
export function parseOfferLines(value: string): ParsedOfferLine[] {
  const lines = String(value || '')
    .split(ACCOUNT_AGENT_REGEX.lineBreak)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line, index) => {
    const urls = extractUrls(line);
    const prices = extractMoneyValues(line);
    const title = line.replace(ACCOUNT_AGENT_REGEX.url, '').trim() || `Plano ${index + 1}`;
    return {
      raw: line,
      title,
      price: prices[0] ?? null,
      url: urls[0] ?? null,
    };
  });
}

/**
 * Builds an offer-summary fragment such as
 * `Opções comerciais registradas: Plano 1 por R$ 99.00; Plano 2.`
 */
function buildOfferSummary(offers: ParsedOfferLine[]): string {
  if (offers.length === 0) {
    return '';
  }
  const parts = offers
    .map((offer) =>
      offer.price ? `${offer.title} por ${formatBrlAmount(offer.price)}` : offer.title,
    )
    .join('; ');
  return ` Opções comerciais registradas: ${parts}.`;
}

/**
 * Composes the canonical product description used by the account agent registry.
 * Combines the product name, free-form description, offer summary and company context.
 */
export function buildProductDescription(params: {
  productName: string;
  descriptionAnswer: string;
  offers: ParsedOfferLine[];
  companyAnswer: string;
}): string {
  const detail = String(params.descriptionAnswer || '').trim();
  const offerSummary = buildOfferSummary(params.offers);
  const companySummary = String(params.companyAnswer || '').trim();
  const companyFragment = companySummary
    ? `Contexto da empresa responsável: ${companySummary}`
    : '';

  return [
    `${params.productName} é uma oferta ativa da conta e deve ser tratada como prioridade comercial.`,
    detail,
    offerSummary,
    companyFragment,
  ]
    .filter(Boolean)
    .join(' ')
    .trim();
}

/** Builds the negotiation-limits FAQ answer based on offer prices and installments. */
function buildNegotiationLimitsAnswer(prices: number[], installments: number | null): string {
  const priceFragment =
    prices.length > 0
      ? `Valores identificados: ${prices.map((value) => `R$ ${value.toFixed(2)}`).join(', ')}`
      : '';
  const installmentFragment = installments
    ? `Parcelamento máximo identificado: ${installments}x.`
    : '';
  return [priceFragment, installmentFragment].filter(Boolean).join(' ');
}

/** Builds the purchase-instructions FAQ answer based on extracted URLs. */
function buildPurchaseAnswer(urls: string[]): string {
  return urls.length > 0
    ? `Links disponíveis: ${urls.join(' | ')}`
    : 'A venda pode ser concluída pelo fluxo comercial da conta.';
}

/**
 * Builds the canonical product FAQ used by the account agent registry.
 * Items with empty answers are dropped so the registry never persists blanks.
 */
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
      answer: buildPurchaseAnswer(urls),
    },
    {
      question: 'Quais limites de negociação eu posso usar?',
      answer: buildNegotiationLimitsAnswer(prices, installments),
    },
    {
      question: 'Quem é a empresa responsável por essa oferta?',
      answer: String(params.companyAnswer || '').trim(),
    },
  ].filter((item) => item.answer);
}
