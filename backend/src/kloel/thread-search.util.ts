const U0300__U036F_RE = /[\u0300-\u036f]/g;
const A_Z0_9_RE = /[^a-z0-9]+/g;
const PATTERN_RE = /<[^>]+>/g;
const S_RE = /\s+/g;
const SEARCH_STOPWORDS = new Set([
  'a',
  'ao',
  'aos',
  'as',
  'com',
  'como',
  'da',
  'das',
  'de',
  'do',
  'dos',
  'e',
  'em',
  'na',
  'nas',
  'no',
  'nos',
  'o',
  'os',
  'ou',
  'para',
  'por',
  'pra',
  'que',
  'um',
  'uma',
]);

const DOMAIN_TAGS = [
  'whatsapp',
  'api',
  'checkout',
  'campanha',
  'campanhas',
  'copy',
  'crm',
  'dns',
  'dominio',
  'domínios',
  'email',
  'funil',
  'instagram',
  'landing',
  'lead',
  'leads',
  'meta',
  'pagamento',
  'pagamentos',
  'pix',
  'produto',
  'produtos',
  'relatorio',
  'relatórios',
  'site',
  'sites',
  'stripe',
  'upsell',
  'venda',
  'vendas',
  'vsl',
  'webhook',
];

function stripDiacritics(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(U0300__U036F_RE, '');
}

function normalizeWord(value: string): string {
  return stripDiacritics(value).toLowerCase().replace(A_Z0_9_RE, '').trim();
}

function tokenize(value: string): string[] {
  return stripDiacritics(value)
    .toLowerCase()
    .split(A_Z0_9_RE)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !SEARCH_STOPWORDS.has(token));
}

export function stripHtmlTags(value: string): string {
  return String(value || '')
    .replace(PATTERN_RE, ' ')
    .replace(S_RE, ' ')
    .trim();
}

function upsertCandidate(candidates: Map<string, number>, tag: string, score: number): void {
  candidates.set(tag, Math.max(candidates.get(tag) || 0, score));
}

function collectQueryTokenMatches(
  candidates: Map<string, number>,
  queryTokens: string[],
  combinedNormalized: string,
): void {
  for (const token of queryTokens) {
    if (combinedNormalized.includes(token)) {
      upsertCandidate(candidates, token, 100);
    }
  }
}

function collectDomainTagMatches(
  candidates: Map<string, number>,
  combinedTokens: Set<string>,
): void {
  for (const tag of DOMAIN_TAGS) {
    const normalizedTag = normalizeWord(tag);
    if (!normalizedTag || !combinedTokens.has(normalizedTag)) continue;
    upsertCandidate(candidates, tag, 70);
  }
}

function tokenMatchesAnyQueryToken(token: string, queryTokens: string[]): boolean {
  return queryTokens.some((queryToken) => token.includes(queryToken) || queryToken.includes(token));
}

function collectContextualTokenMatches(
  candidates: Map<string, number>,
  combinedTokens: string[],
  queryTokens: string[],
  combinedNormalized: string,
): void {
  for (const token of combinedTokens) {
    if (!combinedNormalized.includes(token)) continue;
    if (!tokenMatchesAnyQueryToken(token, queryTokens)) continue;
    upsertCandidate(candidates, token, 55);
  }
}

function topScoredTags(candidates: Map<string, number>, maxTags: number): string[] {
  return [...candidates.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxTags)
    .map(([tag]) => tag);
}

export function extractThreadSearchTags(
  title: string,
  matchedContent: string,
  query: string,
  maxTags = 3,
): string[] {
  const combinedText = `${title} ${matchedContent}`;
  const combinedNormalized = stripDiacritics(combinedText).toLowerCase();
  const combinedTokenList = tokenize(combinedText);
  const combinedTokens = new Set(combinedTokenList);
  const queryTokens = tokenize(query);
  const candidates = new Map<string, number>();

  collectQueryTokenMatches(candidates, queryTokens, combinedNormalized);
  collectDomainTagMatches(candidates, combinedTokens);
  collectContextualTokenMatches(candidates, combinedTokenList, queryTokens, combinedNormalized);

  return topScoredTags(candidates, maxTags);
}
