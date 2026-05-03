import type { UIElementKind, UIElementRisk } from '../../types.ui-crawler';
import { NAVIGATION_PATTERNS } from './constants';

export interface ElementRiskEvidence {
  kind: UIElementKind;
  sourceLine: string;
  handlerName: string | null;
  apiEndpoint: string | null;
  authRequired: boolean;
}

export function extractAttributeValue(line: string, attributeName: string): string | null {
  const quoted = new RegExp(`${attributeName}\\s*=\\s*["'\`]([^"'\`]+)["'\`]`).exec(line);
  if (quoted) return quoted[1];

  const braced = new RegExp(`${attributeName}\\s*=\\s*\\{\\s*["'\`]([^"'\`]+)["'\`]\\s*\\}`).exec(
    line,
  );
  return braced ? braced[1] : null;
}

export function riskFromDomAttribute(line: string): UIElementRisk | null {
  for (const attrName of ['data-risk', 'data-pulse-risk', 'risk']) {
    const value = extractAttributeValue(line, attrName)?.toLowerCase();
    if (value === 'critical') return 'critical';
    if (value === 'high') return 'high';
    if (value === 'medium') return 'medium';
    if (value === 'low') return 'low';
  }
  return null;
}

export function extractHttpMethodSignal(text: string): string | null {
  const attrMethod = extractAttributeValue(text, 'method');
  if (attrMethod) return attrMethod.toUpperCase();

  const propertyMethod = /\bmethod\s*:\s*["'`]([A-Za-z]+)["'`]/.exec(text);
  return propertyMethod ? propertyMethod[1].toUpperCase() : null;
}

export function isMutatingHttpMethod(method: string | null): boolean {
  return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
}

/** Check if a handler expression is purely a navigation call. */
export function isNavigationHandler(handler: string): boolean {
  return NAVIGATION_PATTERNS.some((re) => re.test(handler));
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

export function hasDirectMutationSignal(evidence: ElementRiskEvidence): boolean {
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

  if (hasDirectMutationSignal(evidence)) return 'high';
  if (
    evidence.authRequired &&
    (evidence.kind === 'button' ||
      evidence.kind === 'form' ||
      evidence.kind === 'input' ||
      evidence.kind === 'select' ||
      evidence.kind === 'toggle')
  ) {
    return 'high';
  }
  if (evidence.kind === 'link' || evidence.kind === 'nav') return 'low';
  if (evidence.kind === 'input' || evidence.kind === 'select') return 'low';
  return 'medium';
}
