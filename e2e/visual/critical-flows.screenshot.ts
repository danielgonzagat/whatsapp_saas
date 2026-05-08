import fs from 'node:fs';
import path from 'node:path';
import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { PNG } from 'pngjs';

const MAX_STABLE_SCREENSHOT_ATTEMPTS = 8;
const VISUAL_PIXEL_CHANNEL_TOLERANCE = 3;

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

function countPixelDiff(expected: PNG, actual: PNG) {
  const width = expected.width;
  const height = expected.height;
  const diff = new PNG({ width, height });
  let diffCount = 0;

  for (let index = 0; index < expected.data.length; index += 4) {
    const matches =
      Math.abs(expected.data[index] - actual.data[index]) <= VISUAL_PIXEL_CHANNEL_TOLERANCE &&
      Math.abs(expected.data[index + 1] - actual.data[index + 1]) <=
        VISUAL_PIXEL_CHANNEL_TOLERANCE &&
      Math.abs(expected.data[index + 2] - actual.data[index + 2]) <=
        VISUAL_PIXEL_CHANNEL_TOLERANCE &&
      expected.data[index + 3] === actual.data[index + 3];

    if (matches) {
      diff.data[index] = 255;
      diff.data[index + 1] = 255;
      diff.data[index + 2] = 255;
      diff.data[index + 3] = 0;
      continue;
    }

    diffCount += 1;
    diff.data[index] = 255;
    diff.data[index + 1] = 208;
    diff.data[index + 2] = 0;
    diff.data[index + 3] = 255;
  }

  return { diff, diffCount };
}

export async function assertExactScreenshot(
  page: Page,
  info: TestInfo,
  snapshotName: string,
  options: ScreenshotAssertionOptions = {},
) {
  const snapshotPath = info.snapshotPath(snapshotName);
  const actualPath = info.outputPath(snapshotName.replace(/\.png$/, '-actual.png'));
  const diffPath = info.outputPath(snapshotName.replace(/\.png$/, '-diff.png'));
  const updateSnapshots = ((info.config as { updateSnapshots?: string }).updateSnapshots ||
    'missing') as string;
  const hasSnapshot = fs.existsSync(snapshotPath);
  const allowSnapshotCreate =
    updateSnapshots === 'missing' || updateSnapshots === 'changed' || updateSnapshots === 'all';
  const allowSnapshotUpdate = updateSnapshots === 'all' || updateSnapshots === 'changed';
  const expected = hasSnapshot ? PNG.sync.read(fs.readFileSync(snapshotPath)) : null;
  let lastCapture: PNG | null = null;
  let lastDiff: ReturnType<typeof countPixelDiff> | null = null;

  let previousCapture: PNG | null = null;
  for (let attempt = 1; attempt <= MAX_STABLE_SCREENSHOT_ATTEMPTS; attempt += 1) {
    await page.screenshot({
      path: actualPath,
      fullPage: options.fullPage,
      mask: options.mask,
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
    });

    const currentCapture = PNG.sync.read(fs.readFileSync(actualPath));
    lastCapture = currentCapture;

    if (
      expected &&
      expected.width === currentCapture.width &&
      expected.height === currentCapture.height
    ) {
      const currentDiff = countPixelDiff(expected, currentCapture);
      if (currentDiff.diffCount === 0) {
        return;
      }
      lastDiff = currentDiff;
    }

    if (previousCapture) {
      const { diffCount } = countPixelDiff(previousCapture, currentCapture);
      if (diffCount === 0) {
        break;
      }
    }

    previousCapture = currentCapture;
    if (attempt < MAX_STABLE_SCREENSHOT_ATTEMPTS) {
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          }),
      );
      await page.waitForTimeout(100);
    }
  }

  expect(fs.existsSync(actualPath), `screenshot capture for ${snapshotName} succeeded`).toBe(true);

  if (!hasSnapshot) {
    if (!allowSnapshotCreate) {
      throw new Error(`Missing visual baseline: ${snapshotPath}`);
    }

    fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
    fs.copyFileSync(actualPath, snapshotPath);
    return;
  }

  if (!expected || !lastCapture) {
    throw new Error(`Visual capture unavailable for ${snapshotName}: ${actualPath}`);
  }

  if (expected.width !== lastCapture.width || expected.height !== lastCapture.height) {
    if (allowSnapshotUpdate) {
      fs.copyFileSync(actualPath, snapshotPath);
      return;
    }

    throw new Error(
      [
        `Visual snapshot size mismatch for ${snapshotName}.`,
        `Expected: ${expected.width}x${expected.height}`,
        `Actual: ${lastCapture.width}x${lastCapture.height}`,
        `Baseline: ${snapshotPath}`,
        `Actual: ${actualPath}`,
      ].join('\n'),
    );
  }

  if (allowSnapshotUpdate) {
    fs.copyFileSync(actualPath, snapshotPath);
    return;
  }

  const { diff, diffCount } = lastDiff ?? countPixelDiff(expected, lastCapture);
  fs.writeFileSync(diffPath, PNG.sync.write(diff));
  throw new Error(
    [
      `Visual diff beyond tolerance detected for ${snapshotName}: ${diffCount} pixels differ.`,
      `Baseline: ${snapshotPath}`,
      `Actual: ${actualPath}`,
      `Diff: ${diffPath}`,
    ].join('\n'),
  );
}
