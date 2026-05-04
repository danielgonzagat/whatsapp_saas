import type { UICrawlerStatus, UIDiscoveredElement, UIElementKind } from '../../types.ui-crawler';
import { readTextFile } from '../../safe-fs';
import {
  buildSelector,
  detectElementKind,
  extractFormAction,
  extractHref,
  extractJSXHandler,
  extractLabel,
  isDisabled,
} from './helpers-jsx';
import { extractApiEndpoints } from './helpers-endpoints';
import { classifyElementRisk, isExplicitFakeSignal, isNavigationHandler } from './risk';
import { DOM_HANDLER_PROPS } from './constants';

/**
 * Parse a JSX/TSX file to discover all interactive elements and their handlers.
 *
 * Uses regex-based extraction to find buttons, links, forms, inputs, selects,
 * modals, menus, tabs, and toggles (including shadcn/ui components). For each
 * element, extracts handler names, labels, risk level, and any API endpoints
 * called inline.
 *
 * @param filePath - Absolute path to the JSX/TSX file.
 * @param pageUrl  - The page URL for risk classification context.
 * @param authRequired - Whether the page requires authentication (for risk).
 * @returns Array of discovered elements found in the file.
 */
export function parseElementsFromFile(
  filePath: string,
  _pageUrl = '/',
  authRequired = false,
): UIDiscoveredElement[] {
  let content: string;
  try {
    content = readTextFile(filePath, 'utf8');
  } catch {
    return [];
  }

  const lines = content.split('\n');
  const elements: UIDiscoveredElement[] = [];

  const kindCounters: Record<UIElementKind, number> = {
    button: 0,
    link: 0,
    form: 0,
    input: 0,
    select: 0,
    modal: 0,
    menu: 0,
    nav: 0,
    tab: 0,
    toggle: 0,
  };

  function nextIndex(kind: UIElementKind): number {
    return kindCounters[kind]++;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const kind = detectElementKind(line);
    if (!kind) continue;

    const label = extractLabel(line, lines, i);
    const disabled = isDisabled(line);

    let handlerName: string | null = null;
    let apiEndpoint: string | null = null;

    if (kind === 'link') {
      const href = extractHref(line);
      if (href) {
        handlerName = `navigate-to:${href}`;
        if (href.startsWith('/api/')) apiEndpoint = href;
      }
    }

    if (kind === 'form') {
      const action = extractFormAction(line);
      if (action && action.startsWith('/api/')) {
        apiEndpoint = action;
      }
    }

    for (const prop of Array.from(DOM_HANDLER_PROPS)) {
      const handler = extractJSXHandler(line, prop);
      if (handler) {
        handlerName = handler;
        const endpoints = extractApiEndpoints(handler);
        if (endpoints.length > 0) apiEndpoint = endpoints[0];
      }
    }

    const idx = nextIndex(kind);

    let status: UICrawlerStatus;
    let errorMessage: string | null = null;

    if (!handlerName && kind !== 'input' && kind !== 'select') {
      status = 'no_handler';
    } else if (isExplicitFakeSignal(line, handlerName)) {
      status = 'fake';
      errorMessage = 'Element carries explicit fake/mock/stub evidence';
    } else if (handlerName && isNavigationHandler(handlerName)) {
      status = 'works';
    } else if (handlerName || apiEndpoint) {
      status = 'works';
    } else {
      status = 'no_handler';
    }

    elements.push({
      selector: buildSelector(kind, label, handlerName, idx),
      kind,
      label,
      visible: true,
      enabled: !disabled,
      actionable: !disabled,
      handlerAttached: Boolean(handlerName),
      status,
      linkedEndpoint: apiEndpoint,
      linkedFilePath: null,
      errorMessage,
      risk: classifyElementRisk({
        kind,
        sourceLine: line,
        handlerName,
        apiEndpoint,
        authRequired,
      }),
    });
  }

  return elements;
}
