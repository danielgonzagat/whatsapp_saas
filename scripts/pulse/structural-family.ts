const TECHNICAL_TOKENS = new Set([
  'api',
  'app',
  'apps',
  'backend',
  'common',
  'component',
  'components',
  'context',
  'contexts',
  'controller',
  'controllers',
  'frontend',
  'helper',
  'helpers',
  'hook',
  'hooks',
  'index',
  'internal',
  'js',
  'jsx',
  'lib',
  'main',
  'mjs',
  'module',
  'modules',
  'page',
  'pages',
  'provider',
  'providers',
  'public',
  'route',
  'routes',
  'service',
  'services',
  'shared',
  'spec',
  'src',
  'test',
  'tests',
  'ts',
  'tsx',
  'util',
  'utils',
  'v1',
  'v2',
  'v3',
]);

function readCachedValue<T>(cache: Map<string, T>, key: string): T | null {
  return cache.has(key) ? (cache.get(key) ?? null) : null;
}

const normalizedTextCache = new Map<string, string>();
const tokenCache = new Map<string, string[]>();
const routeSegmentsCache = new Map<string, string[]>();
const structuralFamiliesCache = new Map<string, string[]>();
const familyTokensCache = new Map<string, string[]>();

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

/** Normalize structural text. */
export function normalizeStructuralText(value: string): string {
  const key = String(value || '');
  const cached = readCachedValue(normalizedTextCache, key);
  if (cached !== null) {
    return cached;
  }
  const normalized = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
  normalizedTextCache.set(key, normalized);
  return normalized;
}

function singularize(token: string): string {
  if (token.endsWith('ies') && token.length > 3) {
    return `${token.slice(0, -3)}y`;
  }
  if (token.endsWith('ses') || token.endsWith('ss')) {
    return token;
  }
  if (token.endsWith('s') && token.length > 3) {
    return token.slice(0, -1);
  }
  return token;
}

function normalizeTokens(tokens: string[]): string[] {
  return unique(
    tokens
      .flatMap((token) => [token, singularize(token)])
      .map((token) => token.trim().toLowerCase())
      .filter((token) => token.length >= 2 && /[a-z]/.test(token))
      .filter((token) => !TECHNICAL_TOKENS.has(token)),
  );
}

/** Tokenize structural text. */
export function tokenizeStructuralText(value: string): string[] {
  const key = String(value || '');
  const cached = readCachedValue(tokenCache, key);
  if (cached !== null) {
    return cached;
  }
  const tokens = normalizeTokens(normalizeStructuralText(key).split(/\s+/));
  tokenCache.set(key, tokens);
  return tokens;
}

/** Slugify structural. */
export function slugifyStructural(value: string): string {
  return normalizeStructuralText(value).replace(/\s+/g, '-');
}

/** Title case structural. */
export function titleCaseStructural(value: string): string {
  return value
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function routeSegments(value: string): string[] {
  const key = String(value || '');
  const cached = readCachedValue(routeSegmentsCache, key);
  if (cached !== null) {
    return cached;
  }
  const rawSegments = key
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .filter((segment) => !segment.startsWith(':'))
    .filter((segment) => !/^\d+$/.test(segment));

  const normalized = normalizeTokens(
    rawSegments.flatMap((segment) => normalizeStructuralText(segment).split(/\s+/)),
  );

  routeSegmentsCache.set(key, normalized);
  return normalized;
}

/** Derive route family. */
export function deriveRouteFamily(value: string, maxSegments: number = 2): string | null {
  const segments = routeSegments(value);
  if (segments.length === 0) {
    return null;
  }
  return segments.slice(0, maxSegments).join('-') || null;
}

/** Derive text family. */
export function deriveTextFamily(value: string, maxTokens: number = 2): string | null {
  const tokens = tokenizeStructuralText(value);
  if (tokens.length === 0) {
    return null;
  }
  return tokens.slice(0, maxTokens).join('-') || null;
}

/** Derive structural families. */
export function deriveStructuralFamilies(values: Array<string | null | undefined>): string[] {
  const cacheKey = values.map((value) => value ?? '').join('\u0000');
  const cached = readCachedValue(structuralFamiliesCache, cacheKey);
  if (cached !== null) {
    return cached;
  }
  const families = unique(
    values
      .flatMap((value) => {
        if (!value) {
          return [];
        }
        return [deriveRouteFamily(value), deriveTextFamily(value)].filter(Boolean) as string[];
      })
      .filter(Boolean),
  );
  structuralFamiliesCache.set(cacheKey, families);
  return families;
}

/** Get family tokens. */
export function getFamilyTokens(value: string | string[] | null | undefined): string[] {
  const cacheKey = Array.isArray(value) ? value.join('\u0000') : String(value || '');
  const cached = readCachedValue(familyTokensCache, cacheKey);
  if (cached !== null) {
    return cached;
  }
  const tokens = Array.isArray(value)
    ? normalizeTokens(value.flatMap((entry) => String(entry || '').split(/[-/\s]+/)))
    : normalizeTokens(String(value || '').split(/[-/\s]+/));
  familyTokensCache.set(cacheKey, tokens);
  return tokens;
}

/** Families overlap. */
export function familiesOverlap(
  left: string | string[] | null | undefined,
  right: string | string[] | null | undefined,
): boolean {
  const leftFamilies = Array.isArray(left) ? left : [left];
  const rightFamilies = Array.isArray(right) ? right : [right];

  for (const leftFamily of leftFamilies) {
    const leftTokens = getFamilyTokens(leftFamily);
    if (leftTokens.length === 0) {
      continue;
    }

    for (const rightFamily of rightFamilies) {
      const rightTokens = getFamilyTokens(rightFamily);
      if (rightTokens.length === 0) {
        continue;
      }

      const leftSlug = leftTokens.join('-');
      const rightSlug = rightTokens.join('-');
      if (leftSlug === rightSlug) {
        return true;
      }

      const leftSet = new Set(leftTokens);
      const rightSet = new Set(rightTokens);
      const shared = leftTokens.filter((token) => rightSet.has(token));

      if (leftTokens.length === 1 || rightTokens.length === 1) {
        if (shared.length > 0) {
          return true;
        }
        continue;
      }

      if (shared.length >= 2) {
        return true;
      }

      const smaller = leftTokens.length <= rightTokens.length ? leftSet : rightSet;
      const larger = leftTokens.length <= rightTokens.length ? rightSet : leftSet;
      if ([...smaller].every((token) => larger.has(token))) {
        return true;
      }
    }
  }
  return false;
}

/** Is meaningful ui label. */
export function isMeaningfulUiLabel(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = String(value).trim();
  if (normalized.length === 0 || normalized.length > 80) {
    return false;
  }
  if (/[:;{}[\]=<>]/.test(normalized)) {
    return false;
  }
  return tokenizeStructuralText(normalized).length > 0;
}
