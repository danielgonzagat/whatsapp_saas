/**
 * UI Interaction Crawler — catalog builder (discovery, not execution).
 *
 * Scans the frontend source tree to discover pages, interactive elements,
 * their event handlers, and the backend API endpoints they call. The result
 * is a {@link UICrawlerEvidence} artifact that Playwright-based execution
 * uses later to actually click through the app.
 *
 * @module ui-crawler
 */

import * as path from 'path';
import * as ts from 'typescript';
import type {
  CrawlerRole,
  UICrawlerEvidence,
  UICrawlerStatus,
  UIDiscoveredElement,
  UIDiscoveredPage,
  UIElementKind,
  UIElementRisk,
  UINetworkCall,
} from './types.ui-crawler';
import { ensureDir, pathExists, readDir, readTextFile, writeTextFile } from './safe-fs';
import { safeJoin, safeResolve } from './safe-path';
import { walkFiles } from './parsers/utils';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FRONTEND_SRC = 'frontend/src';
const APP_DIR = 'app';

const DOM_ELEMENTS: Record<string, UIElementKind> = {
  button: 'button',
  a: 'link',
  form: 'form',
  input: 'input',
  select: 'select',
  textarea: 'input',
};

const SHADCN_ELEMENTS: Record<string, UIElementKind> = {
  Button: 'button',
  Link: 'link',
  Form: 'form',
  Input: 'input',
  Select: 'select',
  Textarea: 'input',
  Dialog: 'modal',
  Modal: 'modal',
  DropdownMenu: 'menu',
  NavigationMenu: 'nav',
  Tabs: 'tab',
  Toggle: 'toggle',
  Switch: 'toggle',
};

const DOM_HANDLER_PROPS = new Set([
  'onClick',
  'onSubmit',
  'onChange',
  'onBlur',
  'onFocus',
  'onInput',
  'onKeyDown',
  'onKeyUp',
  'onMouseDown',
  'onMouseEnter',
  'onMouseLeave',
  'onMouseUp',
  'onPointerDown',
  'onPointerEnter',
  'onPointerLeave',
  'onPointerUp',
]);

const NAVIGATION_PATTERNS = [
  /\brouter\s*\.\s*push\s*\(/,
  /\brouter\s*\.\s*replace\s*\(/,
  /\bnavigate\s*\(/,
  /\bwindow\s*\.\s*location\s*\.\s*href\s*=/,
  /\bredirect\s*\(/,
];

const AUTH_BOUNDARY_RE =
  /\b(?:middleware|guard|withAuth|requireAuth|useAuth|useSession|getServerSession|authOptions|canActivate|requireSession|requireUser|protectedRoute)\b/i;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
function extractJSXHandler(line: string, eventName: string): string | null {
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
function extractLabel(line: string, lines: string[], idx: number): string {
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
function isDisabled(line: string): boolean {
  return /\bdisabled\b/.test(line);
}

/** Determine element kind from a JSX line. */
function detectElementKind(line: string): UIElementKind | null {
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
function extractHref(line: string): string | null {
  const match = line.match(/href\s*=\s*["'`]([^"'`]+)["'`]/);
  return match ? match[1] : null;
}

/** Extract the action URL from a form element. */
function extractFormAction(line: string): string | null {
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
function extractApiEndpoints(text: string): string[] {
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

function isExplicitFakeSignal(sourceLine: string, handlerName: string | null): boolean {
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
function isNavigationHandler(handler: string): boolean {
  return NAVIGATION_PATTERNS.some((re) => re.test(handler));
}

/** Build a CSS selector-like string for an element. */
function buildSelector(
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

interface ElementRiskEvidence {
  kind: UIElementKind;
  sourceLine: string;
  handlerName: string | null;
  apiEndpoint: string | null;
  authRequired: boolean;
}

function extractAttributeValue(line: string, attributeName: string): string | null {
  const quoted = new RegExp(`${attributeName}\\s*=\\s*["'\`]([^"'\`]+)["'\`]`).exec(line);
  if (quoted) return quoted[1];

  const braced = new RegExp(`${attributeName}\\s*=\\s*\\{\\s*["'\`]([^"'\`]+)["'\`]\\s*\\}`).exec(
    line,
  );
  return braced ? braced[1] : null;
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
