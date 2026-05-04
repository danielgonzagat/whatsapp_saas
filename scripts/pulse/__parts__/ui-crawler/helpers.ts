import * as path from 'path';
import * as ts from 'typescript';
import type {
  CrawlerRole,
  UIElementKind,
  UIElementRisk,
} from '../../types.ui-crawler';
import { deriveStringUnionMembersFromTypeContract } from '../../dynamic-reality-kernel';
import {
  AUTH_BOUNDARY_RE,
  DOM_ELEMENTS,
  NAVIGATION_PATTERNS,
  ROLE_NAMES,
  SHADCN_ELEMENTS,
} from './constants';

function isWhitespaceChar(c: string | undefined): boolean {
  if (!c) return false;
  return c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v';
}

function isIdentifierChar(c: string | undefined): boolean {
  return Boolean(c && /[\w$]/.test(c));
}

function hasIdentifierAt(text: string, offset: number, identifier: string): boolean {
  if (!text.startsWith(identifier, offset)) return false;
  return !isIdentifierChar(text[offset - 1]) && !isIdentifierChar(text[offset + identifier.length]);
}

/** Extract the handler expression from a JSX prop assignment like `onClick={handler}`. */
export function extractJSXHandler(line: string, eventName: string): string | null {
  let searchFrom = 0;
  while (searchFrom < line.length) {
    const eventIndex = line.indexOf(eventName, searchFrom);
    if (eventIndex < 0) return null;

    let cursor = eventIndex + eventName.length;
    while (isWhitespaceChar(line[cursor])) cursor++;
    if (line[cursor] !== '=') {
      searchFrom = cursor;
      continue;
    }

    cursor++;
    while (isWhitespaceChar(line[cursor])) cursor++;
    if (line[cursor] !== '{') {
      searchFrom = cursor;
      continue;
    }

    const start = cursor + 1;
    let depth = 1;
    let i = start;

    while (i < line.length && depth > 0) {
      const ch = line[i];
      if (ch === '"' || ch === "'" || ch === '`') {
        const quote = ch;
        i++;
        while (i < line.length && line[i] !== quote) {
          if (line[i] === '\\') i++;
          i++;
        }
      } else if (ch === '{') {
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0) return line.substring(start, i).trim();
      }
      i++;
    }

    if (depth > 0 && start < line.length) {
      return line.substring(start).trim();
    }
    searchFrom = start;
  }
  return null;
}

/** Extract a visible label from a JSX line. */
export function extractLabel(line: string, lines: string[], idx: number): string {
  const textMatch = line.match(/>([^<]{1,80})</);
  if (textMatch) return textMatch[1].trim();

  const labelMatch = line.match(/label\s*=\s*["'`]([^"'`]{1,80})["'`]/);
  if (labelMatch) return labelMatch[1];

  const ariaMatch = line.match(/aria-label\s*=\s*["'`]([^"'`]{1,80})["'`]/);
  if (ariaMatch) return ariaMatch[1];

  const titleMatch = line.match(/title\s*=\s*["'`]([^"'`]{1,80})["'`]/);
  if (titleMatch) return titleMatch[1];

  const placeholderMatch = line.match(/placeholder\s*=\s*["'`]([^"'`]{1,80})["'`]/);
  if (placeholderMatch) return placeholderMatch[1];

  for (let j = 1; j <= 3 && idx + j < lines.length; j++) {
    const nextLine = lines[idx + j].trim();
    if (
      /^(?:background|display|width|height|position|border|color|font|padding|margin|flex|align|justify|cursor|opacity|transform|transition|overflow|gap|aspect|grid|z-index|top|left|right|bottom)\s*[:=]/i.test(
        nextLine,
      )
    )
      continue;
    if (/^\.\.\.\w+/.test(nextLine)) continue;

    const nextText = nextLine.match(/^([^<{>\s][^<]{1,80})/);
    if (
      nextText &&
      !nextText[1].includes('=') &&
      !nextText[1].includes('{') &&
      !nextText[1].startsWith('//')
    )
      return nextText[1].trim();

    const insideTag = nextLine.match(/>([^<]{1,80})</);
    if (insideTag) return insideTag[1].trim();
  }

  return '(no label)';
}

/** Check if a JSX element has a `disabled` attribute. */
export function isDisabled(line: string): boolean {
  return /\bdisabled\b/.test(line);
}

/** Determine element kind from a JSX line. */
export function detectElementKind(line: string): UIElementKind | null {
  for (const [tag, kind] of Object.entries(DOM_ELEMENTS)) {
    const re = new RegExp(`<${tag}\\b`, 'i');
    if (re.test(line)) return kind;
  }
  for (const [tag, kind] of Object.entries(SHADCN_ELEMENTS)) {
    const re = new RegExp(`<${tag}\\b`);
    if (re.test(line)) return kind;
  }
  return null;
}

/** Extract href from a link element. */
export function extractHref(line: string): string | null {
  const match = line.match(/href\s*=\s*["'`]([^"'`]+)["'`]/);
  return match ? match[1] : null;
}

/** Extract the action URL from a form element. */
export function extractFormAction(line: string): string | null {
  const match = line.match(/action\s*=\s*["'`]([^"'`]+)["'`]/);
  return match ? match[1] : null;
}

function endpointFromLiteralText(value: string): string | null {
  return value.startsWith('/') ? value : null;
}

function endpointFromTemplateExpression(node: ts.TemplateExpression): string | null {
  const templateParts = [node.head.text, ...node.templateSpans.map((span) => span.literal.text)];

  for (const part of templateParts) {
    if (part.startsWith('/')) {
      return part;
    }
  }

  return null;
}

function endpointFromExpression(node: ts.Expression): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return endpointFromLiteralText(node.text);
  }

  if (ts.isTemplateExpression(node)) {
    return endpointFromTemplateExpression(node);
  }

  return null;
}

/**
 * Extract API endpoint URLs from TS/TSX syntax.
 *
 * This is a syntactic discovery pass: it records literal URL-shaped first
 * arguments from call expressions, but it does not make final product, route,
 * or risk decisions. Those decisions stay downstream and must use observed
 * evidence.
 */
export function extractApiEndpoints(text: string): string[] {
  const endpoints: string[] = [];
  const sourceFile = ts.createSourceFile(
    'pulse-ui-crawler-snippet.tsx',
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const firstArg = node.arguments[0];
      const endpoint = firstArg ? endpointFromExpression(firstArg) : null;
      if (endpoint) {
        endpoints.push(endpoint);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return Array.from(new Set(endpoints));
}

function extractAttributeValue(line: string, attributeName: string): string | null {
  const quoted = new RegExp(`${attributeName}\\s*=\\s*["'\`]([^"'\`]+)["'\`]`).exec(line);
  if (quoted) return quoted[1];

  const braced = new RegExp(`${attributeName}\\s*=\\s*\\{\\s*["'\`]([^"'\`]+)["'\`]\\s*\\}`).exec(
    line,
  );
  return braced ? braced[1] : null;
}

export function isExplicitFakeSignal(sourceLine: string, handlerName: string | null): boolean {
  const status = extractAttributeValue(sourceLine, 'data-pulse-status')?.toLowerCase();
  if (status === 'fake') return true;
  if (status === 'mock') return true;
  if (status === 'stub') return true;

  const handlerStatus = handlerName?.trim().toLowerCase();
  if (handlerStatus === 'fake') return true;
  if (handlerStatus === 'mock') return true;
  if (handlerStatus === 'stub') return true;

  return false;
}

/** Check if a handler expression is purely a navigation call. */
export function isNavigationHandler(handler: string): boolean {
  return NAVIGATION_PATTERNS.some((re) => re.test(handler));
}

/** Build a CSS selector-like string for an element. */
export function buildSelector(
  kind: UIElementKind,
  label: string,
  handlerName: string | null,
  idx: number,
): string {
  if (handlerName) return `${kind}[data-handler="${handlerName}"]`;
  if (label && label !== '(no label)') return `${kind}[aria-label="${label}"]`;
  return `${kind}:nth-of-type(${idx + 1})`;
}

// ---------------------------------------------------------------------------
// Risk classification
// ---------------------------------------------------------------------------

export interface ElementRiskEvidence {
  kind: UIElementKind;
  sourceLine: string;
  handlerName: string | null;
  apiEndpoint: string | null;
  authRequired: boolean;
}

function riskFromDomAttribute(line: string): UIElementRisk | null {
  for (const attrName of ['data-risk', 'data-pulse-risk', 'risk']) {
    const value = extractAttributeValue(line, attrName)?.toLowerCase();
    if (value === 'critical') return 'critical';
    if (value === 'high') return 'high';
    if (value === 'medium') return 'medium';
    if (value === 'low') return 'low';
  }
  return null;
}

function extractHttpMethodSignal(text: string): string | null {
  const attrMethod = extractAttributeValue(text, 'method');
  if (attrMethod) return attrMethod.toUpperCase();

  const propertyMethod = /\bmethod\s*:\s*["'`]([A-Za-z]+)["'`]/.exec(text);
  return propertyMethod ? propertyMethod[1].toUpperCase() : null;
}

function isMutatingHttpMethod(method: string | null): boolean {
  return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
}

function hasDirectMutationSignal(evidence: ElementRiskEvidence): boolean {
  const method = extractHttpMethodSignal(`${evidence.sourceLine}\n${evidence.handlerName ?? ''}`);
  if (isMutatingHttpMethod(method)) return true;
  if (evidence.kind === 'form' && method !== 'GET') return true;
  if (evidence.apiEndpoint && evidence.kind !== 'link' && evidence.kind !== 'nav') return true;
  return Boolean(evidence.handlerName && !isNavigationHandler(evidence.handlerName));
}

/**
 * Classify a UI element's risk level from observed element evidence.
 *
 * Product/domain words in routes or labels are raw signals only; they do not
 * decide risk here. A higher risk needs DOM/source evidence such as an explicit
 * risk attribute, mutating HTTP method, API endpoint, handler, form submission,
 * or authenticated interactive control.
 */
export function classifyElementRisk(evidence: ElementRiskEvidence): UIElementRisk {
  const explicitRisk = riskFromDomAttribute(evidence.sourceLine);
  if (explicitRisk) return explicitRisk;

  const riskLabels = deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.ui-crawler.ts',
    'UIElementRisk',
  );
  const kindLabels = deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.ui-crawler.ts',
    'UIElementKind',
  );
  const authSensitiveKinds = new Set(['button', 'form', 'input', 'select', 'toggle']);
  const safeKinds = new Set(['link', 'nav', 'input', 'select']);

  if (hasDirectMutationSignal(evidence)) return 'high' as UIElementRisk;
  if (evidence.authRequired && authSensitiveKinds.has(evidence.kind))
    return 'high' as UIElementRisk;
  if (safeKinds.has(evidence.kind)) return 'low' as UIElementRisk;
  return 'medium' as UIElementRisk;
}

// ---------------------------------------------------------------------------
// Route → Role classification
// ---------------------------------------------------------------------------

/**
 * Classify a URL route into a {@link CrawlerRole}.
 *
 * @param url - The URL route path (e.g. `/admin/users`, `/vendas/pipeline`).
 * @returns The inferred crawler role.
 */
export function classifyRoleFromRoute(url: string): CrawlerRole {
  if (url === '/') return 'anonymous';
  const [firstSegment] = url
    .split('/')
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean);

  if (firstSegment && ROLE_NAMES.has(firstSegment as CrawlerRole)) {
    return firstSegment as CrawlerRole;
  }

  return 'customer';
}

// ---------------------------------------------------------------------------
// Auth detection
// ---------------------------------------------------------------------------

export function parseNextRouteGroups(relFromApp: string): string[] {
  return relFromApp.split(path.sep).flatMap((segment) => {
    const trimmed = segment.trim();
    if (trimmed.length > 2 && trimmed.startsWith('(') && trimmed.endsWith(')')) {
      return [trimmed.slice(1, -1).toLowerCase()];
    }
    return [];
  });
}

export function routeTokenFromAppSegment(segment: string): string | null {
  if (segment === '.' || segment === '') {
    return null;
  }
  if (segment.startsWith('(') && segment.endsWith(')')) {
    return null;
  }
  if (segment.startsWith('[[...') && segment.endsWith(']]')) {
    return `:${segment.slice(5, -2)}`;
  }
  if (segment.startsWith('[...') && segment.endsWith(']')) {
    return `:${segment.slice(4, -1)}`;
  }
  if (segment.startsWith('[') && segment.endsWith(']')) {
    return `:${segment.slice(1, -1)}`;
  }
  return segment;
}

export function routeFromAppDir(dir: string): string {
  const tokens = dir.split(path.sep).flatMap((segment) => {
    const token = routeTokenFromAppSegment(segment);
    return token ? [token] : [];
  });

  if (tokens.length === 0) {
    return '/';
  }

  return `/${tokens.join('/')}`;
}

/**
 * Determine if a page file or its route group requires authentication.
 * Checks for middleware imports, auth guards, and route group prefixes.
 */
export function detectAuthRequired(filePath: string, relFromApp: string, content: string): boolean {
  if (AUTH_BOUNDARY_RE.test(content)) return true;

  const routeGroups = parseNextRouteGroups(relFromApp);
  if (routeGroups.some((group) => group && AUTH_BOUNDARY_RE.test(group))) return true;

  const normalizedPath = filePath.toLowerCase();
  if (/(?:^|[/.:-])(?:middleware|guard|protected-route)(?:[/.:-]|$)/i.test(normalizedPath))
    return true;

  return false;
}
