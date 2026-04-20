// PULSE Browser Stress Tester — Element Interactors

import type { Page, Locator } from 'playwright';
import type { ObservedApiCall, DiscoveredElement } from './types';
import { generateTestData, generateTestImage } from './data-gen';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/** Interaction result shape. */
export interface InteractionResult {
  /** Api calls property. */
  apiCalls: ObservedApiCall[];
  /** Dom changed property. */
  domChanged: boolean;
  /** Console errors property. */
  consoleErrors: string[];
  /** Error property. */
  error: string | null;
}

// Dangerous button text patterns — skip interaction
const DANGEROUS_RE =
  /^(excluir|deletar|remover|delete|remove|sair|logout|desconectar|disconnect|apagar|cancelar assinatura|encerrar)/i;
const NAVIGATION_ONLY_RE = /^(voltar|back|anterior|← |sair|fechar|cancelar|close)$/i;

/** Is dangerous element. */
export function isDangerousElement(label: string): boolean {
  return DANGEROUS_RE.test(label.trim());
}

/** Is navigation only. */
export function isNavigationOnly(label: string): boolean {
  return NAVIGATION_ONLY_RE.test(label.trim());
}

/** Interact with element. */
export async function interactWithElement(
  page: Page,
  selector: string,
  element: DiscoveredElement,
  timeout: number,
): Promise<InteractionResult> {
  const apiCalls: ObservedApiCall[] = [];
  const consoleErrors: string[] = [];
  let domChanged = false;
  let error: string | null = null;

  // Setup listeners
  const responseHandler = (response: any) => {
    const url = response.url();
    // Only track API calls (not static assets)
    if (url.includes('/api/') || url.includes(':3001/') || url.includes('railway.app/')) {
      const urlObj = new URL(url);
      if (!urlObj.pathname.match(/\.(js|css|ico|png|jpg|svg|woff|ttf)$/)) {
        apiCalls.push({
          method: response.request().method(),
          url: urlObj.pathname,
          status: response.status(),
          timeMs: 0,
        });
      }
    }
  };
  const consoleHandler = (msg: any) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text().slice(0, 200));
    }
  };

  page.on('response', responseHandler);
  page.on('console', consoleHandler);

  try {
    // Get DOM snapshot before interaction
    const domBefore = await page.evaluate(() => document.body.innerHTML.length).catch(() => 0);

    // Dispatch to type-specific handler
    switch (element.type) {
      case 'button':
      case 'clickable':
        await interactButton(page, selector, element, timeout);
        break;
      case 'input':
        await interactInput(page, selector, element);
        break;
      case 'textarea':
        await interactTextarea(page, selector, element);
        break;
      case 'select':
        await interactSelect(page, selector, element, timeout);
        break;
      case 'switch':
      case 'checkbox':
        await interactToggle(page, selector, timeout);
        break;
      case 'file-input':
        await interactFileInput(page, selector);
        break;
      case 'tab':
        await interactTab(page, selector, timeout);
        break;
      case 'link':
        // Don't follow links — just verify they exist
        break;
    }

    // Wait for network settle
    await page.waitForTimeout(1500);

    // Check DOM change
    const domAfter = await page.evaluate(() => document.body.innerHTML.length).catch(() => 0);
    domChanged = Math.abs(domAfter - domBefore) > 10;
  } catch (e: any) {
    error = e.message?.slice(0, 300) || 'Unknown error';
  } finally {
    page.removeListener('response', responseHandler);
    page.removeListener('console', consoleHandler);
  }

  return { apiCalls, domChanged, consoleErrors, error };
}

async function interactButton(
  page: Page,
  selector: string,
  el: DiscoveredElement,
  timeout: number,
): Promise<void> {
  const locator = page.locator(selector).first();
  await locator.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
  await locator.click({ timeout, force: false });

  // If a dialog/modal appeared, close it after recording
  await page.waitForTimeout(500);
  const dialog = page.locator('[role="dialog"]:visible, [data-slot="dialog-content"]:visible');
  if ((await dialog.count()) > 0) {
    // Try to close modal
    const closeBtn = dialog
      .locator(
        'button:has-text("Fechar"), button:has-text("Cancelar"), button[aria-label="Fechar"], button:has-text("×")',
      )
      .first();
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click({ timeout: 3000 }).catch(() => {});
    }
  }
}

async function interactInput(page: Page, selector: string, el: DiscoveredElement): Promise<void> {
  const locator = page.locator(selector).first();
  await locator.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});

  // Check if it's read-only or disabled
  const isReadonly = await locator.getAttribute('readonly').catch(() => null);
  const isDisabled = await locator.isDisabled().catch(() => false);
  if (isReadonly || isDisabled) {
    return;
  }

  const data = generateTestData({
    placeholder: el.placeholder,
    label: el.label,
    inputType: el.inputType,
    inputName: el.inputName,
    tagName: 'INPUT',
  });

  await locator.fill('').catch(() => {});
  await locator.fill(data);
  await locator.press('Tab'); // trigger onBlur
}

async function interactTextarea(
  page: Page,
  selector: string,
  el: DiscoveredElement,
): Promise<void> {
  const locator = page.locator(selector).first();
  await locator.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});

  const isDisabled = await locator.isDisabled().catch(() => false);
  if (isDisabled) {
    return;
  }

  const data = generateTestData({
    placeholder: el.placeholder,
    label: el.label,
    tagName: 'TEXTAREA',
  });

  await locator.fill('');
  await locator.fill(data);
  await locator.press('Tab');
}

async function interactSelect(
  page: Page,
  selector: string,
  el: DiscoveredElement,
  timeout: number,
): Promise<void> {
  const locator = page.locator(selector).first();
  await locator.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});

  // Check if it's a native select or shadcn select-trigger
  const tagName = await locator.evaluate((el) => el.tagName).catch(() => '');

  if (tagName === 'SELECT') {
    // Native select — pick second option if available
    const options = await locator.locator('option').all();
    if (options.length > 1) {
      const value = await options[1].getAttribute('value');
      if (value) {
        await locator.selectOption(value);
      }
    }
  } else {
    // shadcn select trigger — click to open, then click an option
    await locator.click({ timeout: 5000 });
    await page.waitForTimeout(300);
    const items = page.locator('[data-slot="select-item"]:visible, [role="option"]:visible');
    const count = await items.count();
    if (count > 1) {
      await items.nth(1).click({ timeout: 3000 });
    } else if (count === 1) {
      await items.first().click({ timeout: 3000 });
    }
  }
}

async function interactToggle(page: Page, selector: string, timeout: number): Promise<void> {
  const locator = page.locator(selector).first();
  await locator.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});

  // Read current state
  const beforeState =
    (await locator.getAttribute('data-state').catch(() => null)) ||
    (await locator.getAttribute('aria-checked').catch(() => null));

  // Click to toggle
  await locator.click({ timeout });

  await page.waitForTimeout(500);

  // Verify state changed
  const afterState =
    (await locator.getAttribute('data-state').catch(() => null)) ||
    (await locator.getAttribute('aria-checked').catch(() => null));

  // Restore original state by clicking again (avoid side effects)
  if (afterState !== beforeState) {
    await page.waitForTimeout(1000);
    await locator.click({ timeout: 3000 }).catch(() => {});
  }
}

async function interactFileInput(page: Page, selector: string): Promise<void> {
  const locator = page.locator(selector).first();
  const imgBuffer = generateTestImage();

  // Write to temp file
  const tmpPath = path.join(os.tmpdir(), `pulse-test-${Date.now()}.png`);
  fs.writeFileSync(tmpPath, imgBuffer);

  try {
    await locator.setInputFiles(tmpPath);
    await page.waitForTimeout(1000);
  } finally {
    fs.unlinkSync(tmpPath);
  }
}

async function interactTab(page: Page, selector: string, timeout: number): Promise<void> {
  const locator = page.locator(selector).first();
  await locator.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
  await locator.click({ timeout });
  // Wait for tab content to load
  await page.waitForTimeout(1000);
}

/**
 * Find and click a save/submit button after filling form inputs.
 * Returns any API calls observed during the save.
 */
export async function findAndClickSave(page: Page, timeout: number): Promise<ObservedApiCall[]> {
  const apiCalls: ObservedApiCall[] = [];

  const responseHandler = (response: any) => {
    const url = response.url();
    if (url.includes('/api/') || url.includes(':3001/') || url.includes('railway.app/')) {
      const urlObj = new URL(url);
      if (!urlObj.pathname.match(/\.(js|css|ico|png|jpg|svg|woff|ttf)$/)) {
        apiCalls.push({
          method: response.request().method(),
          url: urlObj.pathname,
          status: response.status(),
          timeMs: 0,
        });
      }
    }
  };

  page.on('response', responseHandler);

  try {
    // Look for save/submit buttons in order of specificity
    const saveSelectors = [
      'button:has-text("Salvar alterações")',
      'button:has-text("Salvar alteracoes")',
      'button:has-text("Salvar")',
      'button:has-text("Publicar")',
      'button:has-text("Criar")',
      'button:has-text("Confirmar")',
      'button:has-text("Enviar")',
      'button:has-text("Submit")',
      'button:has-text("Save")',
      'button[type="submit"]',
      '[data-slot="button"]:has-text("Salvar")',
    ];

    for (const sel of saveSelectors) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
        await btn.click({ timeout });
        await page.waitForTimeout(2000);
        break;
      }
    }
  } finally {
    page.removeListener('response', responseHandler);
  }

  return apiCalls;
}
