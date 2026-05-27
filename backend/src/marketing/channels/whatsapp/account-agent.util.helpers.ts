/**
 * Regex catalog used by account-agent text utilities.
 * Hoisted to a single module so the parsing functions can share canonical patterns
 * without re-declaring them per call (and so Codacy can index them in one place).
 */
export const ACCOUNT_AGENT_REGEX = {
  /** Matches Unicode combining diacritical marks (used after NFD normalization). */
  diacritics: /[\u0300-\u036f]/g,
  /** Matches characters that are not lowercase letters/digits/whitespace/hyphens. */
  nonAlphaNumWhitespaceHyphen: /[^a-z0-9\s-]/g,
  /** Matches one or more whitespace characters. */
  whitespaceRun: /\s+/g,
  /** Matches one or more hyphens (for slug squashing). */
  hyphenRun: /-+/g,
  /** Matches accented + ASCII alphanumeric tokens with optional internal hyphen. */
  alphaNumericWord: /[A-Za-zÀ-ÿ0-9-]+/g,
  /** Matches HTTP/HTTPS URLs (greedy until whitespace or closing parenthesis). */
  url: /https?:\/\/[^\s)]+/gi,
  /** Matches BR-style monetary values, optionally prefixed with R$. */
  monetary: /(?:R\$\s*)?\d{1,3}(?:\.\d{3})*(?:,\d{2})|(?:R\$\s*)?\d+(?:,\d{2})?/g,
  /** Matches the literal R$ currency prefix. */
  currencyPrefix: /R\$\s*/gi,
  /** Matches a literal dot (used for thousands separator stripping). */
  dot: /\./g,
  /** Matches percentage tokens like "12%" or "12,5%". */
  percentage: /\b(\d{1,2})(?:[.,]\d+)?\s*%/g,
  /** Matches characters that are not digits or decimal separators. */
  nonNumeric: /[^\d.,]/g,
  /** Matches installment counts like "12x" or "10 X". */
  installment: /\b(\d{1,2})\s*x\b/gi,
  /** Matches characters that are not digits. */
  nonDigit: /[^\d]/g,
  /** Matches all-caps SKU-like tokens (e.g. KIT-3, COMBO-FAMILIA). */
  uppercaseSku: /^[A-Z0-9-]{3,}$/,
  /** Matches CRLF/LF line breaks. */
  lineBreak: /\r?\n+/,
} as const;

/**
 * Lowercase keywords that signal commercial/buying intent in inbound messages.
 * Compared after `normalizeCatalogText` removes accents and lowercases the input.
 */
export const BUYING_SIGNALS: readonly string[] = [
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

/**
 * Lowercase cue words that frequently precede a product mention in Portuguese chat.
 * Used by the missing-product candidate extractor to anchor capture windows.
 */
export const PRODUCT_CUE_WORDS: ReadonlySet<string> = new Set([
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

/**
 * Stopwords filtered out before deriving product candidates from raw chat tokens.
 * Includes prepositions, articles, and commerce-domain noise that would drown the signal.
 */
export const STOPWORDS: ReadonlySet<string> = new Set([
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
