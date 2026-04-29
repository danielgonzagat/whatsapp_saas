// PULSE Browser Stress Tester — Page Tester
import { safeJoin, safeResolve } from '../safe-path';

import type { Page, Locator } from 'playwright';
import type {
  PageTestResult,
  ElementTestResult,
  DiscoveredElement,
  StressTestConfig,
  TestDataEntry,
  ObservedApiCall,
} from './types';
import type { PageFunctionalMap, InteractionChain } from '../functional-map-types';
import {
  interactWithElement,
  isDangerousElement,
  isNavigationOnly,
  findAndClickSave,
} from './interactors';
import { classifyResult, matchToFmapEntry, verifyPersistence } from './verifier';
import { discoverBrowserLiveArtifacts, isLoginRedirectFromArtifacts } from './live-artifacts';
import * as path from 'path';
import { ensureDir } from '../safe-fs';

/**
 * Test all interactions on a single page.
 */
export async function testPage(
  page: Page,
  route: string,
  fmapPage: PageFunctionalMap | null,
  config: StressTestConfig,
  createdData: TestDataEntry[],
): Promise<PageTestResult> {
  const results: ElementTestResult[] = [];
  const pageConsoleErrors: string[] = [];
  const startTime = Date.now();
  const pagePolicy = discoverBrowserLiveArtifacts().pages;

  // Console error collector for page-level
  const consoleHandler = (msg: any) => {
    if (msg.type() === 'error') {
      pageConsoleErrors.push(msg.text().slice(0, 200));
    }
  };
  page.on('console', consoleHandler);

  // 1. Navigate to page
  let loadStatus: PageTestResult['loadStatus'] = 'ok';
  let loadTimeMs = 0;

  try {
    const navStart = Date.now();
    await page.goto(`${config.frontendUrl}${route}`, {
      waitUntil: 'domcontentloaded',
      timeout: config.timeoutPerPage,
    });
    loadTimeMs = Date.now() - navStart;

    // Wait for hydration
    await page.waitForTimeout(2000);

    if (isLoginRedirectFromArtifacts(page.url(), pagePolicy)) {
      loadStatus = 'redirect';
      page.removeListener('console', consoleHandler);
      return {
        route,
        group: fmapPage?.group || 'unknown',
        loadTimeMs,
        loadStatus,
        elementsFound: 0,
        elementsTested: 0,
        results: [],
        screenshotPath: null,
        consoleErrors: pageConsoleErrors,
      };
    }

    // Check for error boundary
    const errorText = await page
      .locator('text=/Something went wrong|Application error|Error/i')
      .first()
      .isVisible({ timeout: 1000 })
      .catch(() => false);
    if (errorText) {
      loadStatus = 'error';
      const ssPath = await takeScreenshot(page, route, 'page-error', config.screenshotDir);
      page.removeListener('console', consoleHandler);
      return {
        route,
        group: fmapPage?.group || 'unknown',
        loadTimeMs,
        loadStatus,
        elementsFound: 0,
        elementsTested: 0,
        results: [],
        screenshotPath: ssPath,
        consoleErrors: pageConsoleErrors,
      };
    }
  } catch (e: any) {
    loadTimeMs = Date.now() - startTime;
    if (e.message?.includes('Timeout')) {
      loadStatus = 'timeout';
    } else {
      loadStatus = 'error';
    }
    const ssPath = await takeScreenshot(page, route, 'load-fail', config.screenshotDir);
    page.removeListener('console', consoleHandler);
    return {
      route,
      group: fmapPage?.group || 'unknown',
      loadTimeMs,
      loadStatus,
      elementsFound: 0,
      elementsTested: 0,
      results: [],
      screenshotPath: ssPath,
      consoleErrors: [e.message?.slice(0, 200) || 'Navigation error'],
    };
  }

  // 2. Discover interactive elements
  const elements = await discoverInteractiveElements(page);

  // 3. Test each element
  const fmapInteractions = fmapPage?.interactions || [];
  let hasInputs = false;

  for (const element of elements) {
    if (element.type === 'input' || element.type === 'textarea') {
      hasInputs = true;
    }

    const elStart = Date.now();
    const label = element.label.slice(0, 60);

    // Skip dangerous elements
    if (isDangerousElement(element.label)) {
      results.push({
        pageRoute: route,
        elementLabel: label,
        elementType: element.type,
        selectorUsed: element.selector,
        matchedFmapEntry: null,
        fmapStatus: null,
        browserStatus: 'NAO_TESTAVEL',
        reason: 'Dangerous element (delete/logout)',
        apiCallObserved: null,
        domChangeDetected: false,
        persistenceVerified: null,
        screenshotPath: null,
        durationMs: 0,
        consoleErrors: [],
      });
      continue;
    }

    // Skip navigation-only buttons
    if (element.type === 'link' || (element.type === 'button' && isNavigationOnly(element.label))) {
      results.push({
        pageRoute: route,
        elementLabel: label,
        elementType: element.type,
        selectorUsed: element.selector,
        matchedFmapEntry: null,
        fmapStatus: null,
        browserStatus: 'FUNCIONA',
        reason: 'Navigation element — exists and is clickable',
        apiCallObserved: null,
        domChangeDetected: false,
        persistenceVerified: null,
        screenshotPath: null,
        durationMs: 0,
        consoleErrors: [],
      });
      continue;
    }

    // Skip disabled elements
    if (element.isDisabled) {
      results.push({
        pageRoute: route,
        elementLabel: label,
        elementType: element.type,
        selectorUsed: element.selector,
        matchedFmapEntry: null,
        fmapStatus: null,
        browserStatus: 'NAO_TESTAVEL',
        reason: 'Element is disabled',
        apiCallObserved: null,
        domChangeDetected: false,
        persistenceVerified: null,
        screenshotPath: null,
        durationMs: 0,
        consoleErrors: [],
      });
      continue;
    }

    // Match to functional map
    const fmapMatch = matchToFmapEntry(element.label, element.type, fmapInteractions);

    // Interact
    let result: ElementTestResult;
    try {
      const obs = await interactWithElement(
        page,
        element.selector,
        element,
        config.timeoutPerElement,
      );

      const classification = classifyResult({
        apiCalls: obs.apiCalls,
        domChanged: obs.domChanged,
        consoleErrors: obs.consoleErrors,
        error: obs.error,
        timedOut: false,
        elementNotFound: false,
      });

      let ssPath: string | null = null;
      if (classification.status !== 'FUNCIONA' && classification.status !== 'NAO_TESTAVEL') {
        ssPath = await takeScreenshot(
          page,
          route,
          label.replace(/[^a-zA-Z0-9]/g, '_'),
          config.screenshotDir,
        );
      }

      result = {
        pageRoute: route,
        elementLabel: label,
        elementType: element.type,
        selectorUsed: element.selector,
        matchedFmapEntry: fmapMatch?.elementLabel || null,
        fmapStatus: fmapMatch?.status || null,
        browserStatus: classification.status,
        reason: classification.reason,
        apiCallObserved: obs.apiCalls[0] || null,
        domChangeDetected: obs.domChanged,
        persistenceVerified: null,
        screenshotPath: ssPath,
        durationMs: Date.now() - elStart,
        consoleErrors: obs.consoleErrors,
      };
    } catch (e: any) {
      const ssPath = await takeScreenshot(
        page,
        route,
        label.replace(/[^a-zA-Z0-9]/g, '_'),
        config.screenshotDir,
      );
      result = {
        pageRoute: route,
        elementLabel: label,
        elementType: element.type,
        selectorUsed: element.selector,
        matchedFmapEntry: fmapMatch?.elementLabel || null,
        fmapStatus: fmapMatch?.status || null,
        browserStatus: e.message?.includes('Timeout') ? 'TIMEOUT' : 'CRASH',
        reason: e.message?.slice(0, 150) || 'Unknown error',
        apiCallObserved: null,
        domChangeDetected: false,
        persistenceVerified: null,
        screenshotPath: ssPath,
        durationMs: Date.now() - elStart,
        consoleErrors: [],
      };
    }

    results.push(result);

    // Check if page navigated away — if so, navigate back
    if (!page.url().includes(route.replace(/:[^/]+/g, ''))) {
      try {
        await page.goto(`${config.frontendUrl}${route}`, {
          waitUntil: 'domcontentloaded',
          timeout: 15000,
        });
        await page.waitForTimeout(1500);
      } catch {
        // Can't recover — stop testing this page
        break;
      }
    }
  }

  // 4. Form-level save test (if page has inputs and a save button)
  if (hasInputs && !config.skipPersistence) {
    const saveApiCalls = await findAndClickSave(page, config.timeoutPerElement);
    if (saveApiCalls.length > 0) {
      const successCalls = saveApiCalls.filter((c) => c.status >= 200 && c.status < 400);
      if (successCalls.length > 0) {
        // Verify persistence
        const persisted = await verifyPersistence(page, route, config.frontendUrl);
        // Update the last save button result with persistence info
        const saveResult = results.find((r) =>
          /salvar|save|criar|create|publicar/i.test(r.elementLabel),
        );
        if (saveResult) {
          saveResult.persistenceVerified = persisted;
        }
      }
    }
  }

  page.removeListener('console', consoleHandler);

  return {
    route,
    group: fmapPage?.group || 'unknown',
    loadTimeMs,
    loadStatus,
    elementsFound: elements.length,
    elementsTested: results.length,
    results,
    screenshotPath: null,
    consoleErrors: pageConsoleErrors,
  };
}

/**
 * Discover all interactive elements on the current page.
 */
async function discoverInteractiveElements(page: Page): Promise<DiscoveredElement[]> {
  const elements: DiscoveredElement[] = [];
  const seenBoxes = new Set<string>();

  async function addElements(selector: string, type: DiscoveredElement['type']): Promise<void> {
    const locators = page.locator(selector);
    const count = await locators.count().catch(() => 0);

    for (let i = 0; i < count && i < 100; i++) {
      // Cap at 100 per type per page
      try {
        const loc = locators.nth(i);
        const isVisible = await loc.isVisible({ timeout: 500 }).catch(() => false);
        if (!isVisible) {
          continue;
        }

        const box = await loc.boundingBox().catch(() => null);
        if (!box || box.width < 5 || box.height < 5) {
          continue;
        }

        // Dedup by bounding box
        const boxKey = `${Math.round(box.x)},${Math.round(box.y)},${Math.round(box.width)},${Math.round(box.height)}`;
        if (seenBoxes.has(boxKey)) {
          continue;
        }
        seenBoxes.add(boxKey);

        const label = await extractLabel(loc);
        const placeholder = await loc.getAttribute('placeholder').catch(() => null);
        const inputType = await loc.getAttribute('type').catch(() => null);
        const inputName = await loc.getAttribute('name').catch(() => null);
        const isDisabled = await loc.isDisabled().catch(() => false);

        // Build a unique selector for this element
        const uniqueSelector = await buildUniqueSelector(loc, selector, i, label);

        elements.push({
          label: label || '(no label)',
          type,
          selector: uniqueSelector,
          placeholder: placeholder || undefined,
          inputType: inputType || undefined,
          inputName: inputName || undefined,
          isDisabled,
          boundingBox: box,
        });
      } catch {
        // Element became stale — skip
      }
    }
  }

  // Discover by priority
  // Tier 1: data-slot attributes (shadcn)
  await addElements('[data-slot="button"]:visible', 'button');
  await addElements('[data-slot="input"]:visible', 'input');
  await addElements('[data-slot="switch"]:visible', 'switch');
  await addElements('[data-slot="select-trigger"]:visible', 'select');
  await addElements('[data-slot="checkbox"]:visible', 'checkbox');
  await addElements('[data-slot="textarea"]:visible', 'textarea');

  // Tier 2: Native/ARIA elements
  await addElements('button:visible:not([data-slot])', 'button');
  await addElements('[role="switch"]:visible:not([data-slot])', 'switch');
  await addElements('[role="tab"]:visible', 'tab');
  await addElements(
    'input:visible:not([type="hidden"]):not([type="file"]):not([data-slot])',
    'input',
  );
  await addElements('textarea:visible:not([data-slot])', 'textarea');
  await addElements('select:visible', 'select');
  await addElements('input[type="file"]', 'file-input');

  // Tier 3: Fallback
  await addElements('[role="button"]:visible:not(button):not([data-slot])', 'clickable');

  return elements;
}

async function extractLabel(locator: Locator): Promise<string> {
  // Try multiple strategies to get a human-readable label
  const ariaLabel = await locator.getAttribute('aria-label').catch(() => null);
  if (ariaLabel) {
    return ariaLabel.trim();
  }

  const title = await locator.getAttribute('title').catch(() => null);
  if (title) {
    return title.trim();
  }

  const text = await locator.textContent().catch(() => null);
  if (text) {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (clean.length > 0 && clean.length < 80) {
      return clean;
    }
    if (clean.length >= 80) {
      return clean.slice(0, 77) + '...';
    }
  }

  const placeholder = await locator.getAttribute('placeholder').catch(() => null);
  if (placeholder) {
    return `[${placeholder}]`;
  }

  const name = await locator.getAttribute('name').catch(() => null);
  if (name) {
    return `[name=${name}]`;
  }

  return '(no label)';
}

async function buildUniqueSelector(
  locator: Locator,
  baseSelector: string,
  index: number,
  label: string,
): Promise<string> {
  void locator;
  void label;
  return `${baseSelector} >> nth=${index}`;
}

async function takeScreenshot(
  page: Page,
  route: string,
  label: string,
  screenshotDir: string,
): Promise<string | null> {
  try {
    const dir = safeJoin(screenshotDir, route.replace(/\//g, '_').replace(/^_/, '') || 'root');
    ensureDir(dir, { recursive: true });
    const filename = `${label.slice(0, 40).replace(/[^a-zA-Z0-9_-]/g, '')}_${Date.now()}.png`;
    const fullPath = safeJoin(dir, filename);
    await page.screenshot({ path: fullPath, fullPage: false });
    return fullPath;
  } catch {
    return null;
  }
}
