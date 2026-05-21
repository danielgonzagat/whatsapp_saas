import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';

export const VISUAL_BROWSER_ARGS = [
  '--force-color-profile=srgb',
  '--font-render-hinting=none',
  '--disable-lcd-text',
  '--disable-skia-runtime-opts',
];

type ScreenshotAssertionOptions = {
  fullPage?: boolean;
  mask?: Locator[];
};

export async function assertExactScreenshot(
  page: Page,
  _info: TestInfo,
  snapshotName: string,
  options: ScreenshotAssertionOptions = {},
) {
  await expect(page).toHaveScreenshot(snapshotName, {
    fullPage: options.fullPage,
    mask: options.mask,
    animations: 'disabled',
    caret: 'hide',
    scale: 'css',
    maxDiffPixels: 0,
    threshold: 0.05,
  });
}
