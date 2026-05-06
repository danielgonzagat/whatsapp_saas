/** String/regex helpers shared by api-parser modules. */
import { discoverAllObservedHttpMethods } from '../dynamic-reality-kernel/__parts__/catalog-arithmetic';

/** Escape a string for use as a literal pattern in a RegExp. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function discoverHttpMethodLiteralPattern(): RegExp {
  const alternatives = discoverAllObservedHttpMethods().map(escapeRegExp).join('|');
  return new RegExp(`method\\s*:\\s*['"\`](${alternatives})['"\`]`, 'i');
}

function discoverReadHttpMethodFallback(): string {
  const methods = discoverAllObservedHttpMethods();
  return methods.find((method) => method.toLowerCase() === 'get') ?? methods[0] ?? '';
}

/** Parse a URL or path string, returning just the pathname. */
export function parseUrlPath(value: string): string {
  try {
    if (/^https?:\/\//i.test(value)) {
      return new URL(value).pathname.replace(/\/$/, '');
    }
  } catch {
    return '';
  }
  return value.startsWith('/') ? value.replace(/\/$/, '') : '';
}

/** Return true if this template expression is a query-string builder. */
export function isQueryTemplateExpression(expression: string): boolean {
  return /\?|URLSearchParams|query|queryString|search|params|toString\(\)|buildQuery|qs\b/i.test(
    expression,
  );
}

/** Find the closing brace of a template expression starting at `start`. */
export function findTemplateExpressionEnd(text: string, start: number): number {
  let depth = 1;
  let quote: string | null = null;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

/** Find the closing quote of a quoted string starting after the opening quote at `start`. */
export function findQuotedStringEnd(text: string, start: number, quote: string): number {
  for (let i = start; i < text.length; i++) {
    if (text[i] === '\\') {
      i++;
      continue;
    }
    if (text[i] === quote) {
      return i;
    }
  }
  return -1;
}

/** Read a template literal endpoint from position `start` (after the opening backtick). */
export function readTemplateEndpoint(text: string, start: number): string {
  let raw = '';
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === '`') {
      break;
    }
    if (ch !== '$' || text[i + 1] !== '{') {
      raw += ch;
      continue;
    }

    const expressionEnd = findTemplateExpressionEnd(text, i + 2);
    if (expressionEnd < 0) {
      break;
    }
    const expression = text.slice(i + 2, expressionEnd);
    if (isQueryTemplateExpression(expression)) {
      break;
    }
    raw += '${' + expression + '}';
    i = expressionEnd;
  }
  return raw;
}

/** Detect the HTTP method from a code context string. */
export function detectMethod(context: string): string {
  const m = context.match(discoverHttpMethodLiteralPattern());
  if (m) {
    return m[1].toUpperCase();
  }
  for (const method of discoverAllObservedHttpMethods()) {
    if (new RegExp(`\\.${escapeRegExp(method.toLowerCase())}\\s*\\(`, 'i').test(context)) {
      return method.toUpperCase();
    }
  }
  return discoverReadHttpMethodFallback();
}
