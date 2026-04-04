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
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeWord(value: string): string {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function tokenize(value: string): string[] {
  return stripDiacritics(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !SEARCH_STOPWORDS.has(token));
}

export function stripHtmlTags(value: string): string {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractThreadSearchTags(
  title: string,
  matchedContent: string,
  query: string,
  maxTags = 3,
): string[] {
  const combinedText = `${title} ${matchedContent}`;
  const combinedNormalized = stripDiacritics(combinedText).toLowerCase();
  const combinedTokens = new Set(tokenize(combinedText));
  const candidates = new Map<string, number>();

  for (const token of tokenize(query)) {
    if (combinedNormalized.includes(token)) {
      candidates.set(token, Math.max(candidates.get(token) || 0, 100));
    }
  }

  for (const tag of DOMAIN_TAGS) {
    const normalizedTag = normalizeWord(tag);
    if (!normalizedTag || !combinedTokens.has(normalizedTag)) {
      continue;
    }
    candidates.set(tag, Math.max(candidates.get(tag) || 0, 70));
  }

  for (const token of tokenize(combinedText)) {
    if (!combinedNormalized.includes(token)) continue;
    const queryMatch = tokenize(query).some(
      (queryToken) => token.includes(queryToken) || queryToken.includes(token),
    );
    if (!queryMatch) continue;
    candidates.set(token, Math.max(candidates.get(token) || 0, 55));
  }

  return [...candidates.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxTags)
    .map(([tag]) => tag);
}
