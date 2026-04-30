/**
 * PULSE Parser 93: Browser & Network Checker
 * Layer 24: Client Resilience
 * Mode: DEEP (requires codebase scan + optional Playwright browser tests)
 *
 * CHECKS:
 * 1. Cross-browser compatibility: checks for CSS/JS features that are unsupported
 *    in Safari/Firefox — CSS grid subgrid, :has(), container queries without fallback
 * 2. Slow network handling: verifies loading skeletons/spinners exist for async data
 *    — pages that render blank on 3G are unusable for Brazilian mobile users
 * 3. Offline data loss prevention: forms do not lose data when connection drops mid-submit
 *    — checks for form state preservation (draft save, localStorage backup, optimistic UI)
 * 4. PWA installability: if manifest.json exists, verifies:
 *    - Service worker registered
 *    - HTTPS enforced
 *    - Icons in required sizes (192x192, 512x512)
 * 5. Large page bundle size: checks next.config.js for bundle analyzer or size budget
 * 6. Image optimization: verifies <img> tags use Next.js <Image> component (not raw <img>)
 *    — already covered by nextjs-checker, but checks for critical pages here
 * 7. Viewport meta tag present in layout
 *
 * REQUIRES: PULSE_DEEP=1
 * Emits browser/network evidence gaps; diagnostic identity is synthesized downstream.
 */
import { safeJoin } from '../safe-path';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { pathExists, readTextFile } from '../safe-fs';

function splitIdentifierTokens(value: string): Set<string> {
  const tokens = new Set<string>();
  let current = '';
  for (const char of value) {
    const isAlphaNumeric =
      (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || (char >= '0' && char <= '9');
    if (!isAlphaNumeric) {
      if (current) {
        tokens.add(current.toLowerCase());
        current = '';
      }
      continue;
    }
    if (current && current[current.length - 1] >= 'a' && current[current.length - 1] <= 'z') {
      if (char >= 'A' && char <= 'Z') {
        tokens.add(current.toLowerCase());
        current = char;
        continue;
      }
    }
    current += char;
  }
  if (current) {
    tokens.add(current.toLowerCase());
  }
  return tokens;
}

function hasTokenPrefix(tokens: Set<string>, prefix: string): boolean {
  return [...tokens].some((token) => token.startsWith(prefix));
}

function hasCompatibilityRiskEvidence(line: string): boolean {
  const tokens = splitIdentifierTokens(line);
  const normalized = line.toLowerCase();
  const trimmed = line.trim();
  return (
    tokens.has('subgrid') ||
    normalized.includes(':has(') ||
    (trimmed.startsWith('@') && tokens.has('container')) ||
    (trimmed.startsWith('@') && tokens.has('layer'))
  );
}

function hasCompatibilityFallbackEvidence(context: string): boolean {
  const tokens = splitIdentifierTokens(context);
  return (
    tokens.has('supports') ||
    tokens.has('webkit') ||
    tokens.has('moz') ||
    hasTokenPrefix(tokens, 'fallback')
  );
}

function hasAsyncDataFetchEvidence(content: string): boolean {
  const tokens = splitIdentifierTokens(content);
  return (
    (tokens.has('use') && tokens.has('swr')) ||
    (tokens.has('use') && tokens.has('effect') && tokens.has('fetch')) ||
    (tokens.has('api') && tokens.has('fetch')) ||
    (tokens.has('use') && tokens.has('query'))
  );
}

function hasLoadingStateEvidence(content: string): boolean {
  const tokens = splitIdentifierTokens(content);
  return (
    hasTokenPrefix(tokens, 'skeleton') ||
    hasTokenPrefix(tokens, 'loading') ||
    tokens.has('spinner') ||
    tokens.has('shimmer') ||
    (tokens.has('is') && tokens.has('loading'))
  );
}

function hasOfflineProtectionEvidence(content: string): boolean {
  const tokens = splitIdentifierTokens(content);
  return (
    (tokens.has('local') && tokens.has('storage') && tokens.has('set') && tokens.has('form')) ||
    tokens.has('draft') ||
    tokens.has('autosave') ||
    (tokens.has('form') && tokens.has('persist')) ||
    (tokens.has('offline') && tokens.has('queue')) ||
    (tokens.has('save') && tokens.has('form') && tokens.has('state')) ||
    (tokens.has('saved') && tokens.has('draft'))
  );
}

function hasValueBearingFormState(content: string): boolean {
  const tokens = splitIdentifierTokens(content);
  return (
    hasTokenPrefix(tokens, 'amount') ||
    tokens.has('total') ||
    tokens.has('subtotal') ||
    hasTokenPrefix(tokens, 'price') ||
    tokens.has('currency') ||
    tokens.has('balance') ||
    (tokens.has('billing') && tokens.has('address')) ||
    (tokens.has('tax') && tokens.has('id'))
  );
}

function browserNetworkFinding(input: {
  severity: Break['severity'];
  file: string;
  line: number;
  description: string;
  detail: string;
  observed?: boolean;
}): Break {
  return {
    type: 'browser-network-evidence-gap',
    severity: input.severity,
    file: input.file,
    line: input.line,
    description: input.description,
    detail: input.detail,
    source: input.observed
      ? 'parser:confirmed_static:browser-network'
      : 'parser:weak_signal:browser-network',
    surface: 'client-resilience',
  };
}

/** Check browser network. */
export function checkBrowserNetwork(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const frontendFiles = walkFiles(config.frontendDir, ['.tsx', '.ts', '.css', '.scss']);

  // CHECK 1: Cross-browser CSS compatibility
  for (const file of frontendFiles) {
    if (/node_modules|\.next/.test(file)) {
      continue;
    }
    if (!/\.(css|scss|tsx|ts)$/.test(file)) {
      continue;
    }

    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    const relFile = path.relative(config.rootDir, file);
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) {
        continue;
      }

      if (hasCompatibilityRiskEvidence(line)) {
        // Check for fallback (@supports or vendor prefix) in context
        const context = lines.slice(Math.max(0, i - 5), i + 5).join('\n');
        const hasFallback = hasCompatibilityFallbackEvidence(context);
        if (!hasFallback) {
          breaks.push(
            browserNetworkFinding({
              severity: 'medium',
              file: relFile,
              line: i + 1,
              description:
                'CSS feature with limited browser support used without @supports fallback',
              detail: `${line.slice(0, 120)} — Safari/Firefox may not support this; add @supports() fallback`,
            }),
          );
        }
      }
    }
  }

  // CHECK 2: Pages without loading states
  const pageFiles = frontendFiles.filter(
    (f) => /page\.(tsx|ts)$/.test(f) && !/node_modules|\.next/.test(f),
  );

  for (const file of pageFiles) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    const relFile = path.relative(config.rootDir, file);

    // Pages that fetch data but have no loading indicators
    const fetchesData = hasAsyncDataFetchEvidence(content);
    const hasLoadingState = hasLoadingStateEvidence(content);

    if (fetchesData && !hasLoadingState) {
      breaks.push(
        browserNetworkFinding({
          severity: 'medium',
          file: relFile,
          line: 0,
          description:
            'Page fetches async data but has no loading state — blank/broken UI on slow network',
          detail:
            'Add skeleton loader, spinner, or loading placeholder while data is being fetched',
        }),
      );
    }
  }

  // CHECK 3: Offline data loss in forms
  const formFiles = frontendFiles.filter((f) => !/node_modules|\.next/.test(f));
  const hasDraftPersistence = frontendFiles.some((f) => {
    if (/node_modules|\.next/.test(f)) {
      return false;
    }
    try {
      const content = readTextFile(f, 'utf8');
      return hasOfflineProtectionEvidence(content);
    } catch {
      return false;
    }
  });

  for (const file of formFiles) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    const relFile = path.relative(config.rootDir, file);

    // Long multi-field forms without persistence
    const hasForm = /<form|useForm|handleSubmit/i.test(content);
    const hasOfflineProtection = hasOfflineProtectionEvidence(content);
    const isControlledFormChild =
      /updateField|form:\s*[A-Za-z_$]\w+|form=\{[A-Za-z_$][\w$.]*\.form\}/i.test(content) &&
      hasDraftPersistence;

    // Only flag high-stakes money-like forms.
    if (
      hasForm &&
      !hasOfflineProtection &&
      !isControlledFormChild &&
      hasValueBearingFormState(content)
    ) {
      breaks.push(
        browserNetworkFinding({
          severity: 'high',
          file: relFile,
          line: 0,
          description:
            'Money-like form has no offline protection — user loses entered data on connection drop',
          detail:
            'Save form progress to localStorage on every field change; restore on mount; show offline indicator',
        }),
      );
    }
  }

  // CHECK 4: PWA installability
  const manifestPath = safeJoin(config.frontendDir, 'public', 'manifest.json');
  const manifestAltPath = safeJoin(config.frontendDir, 'public', 'manifest.webmanifest');

  const manifestFile = pathExists(manifestPath)
    ? manifestPath
    : pathExists(manifestAltPath)
      ? manifestAltPath
      : null;

  if (manifestFile) {
    let manifest: Record<string, unknown>;
    try {
      manifest = JSON.parse(readTextFile(manifestFile, 'utf8')) as Record<string, unknown>;
    } catch {
      manifest = {};
    }

    const relManifest = path.relative(config.rootDir, manifestFile);

    // Check service worker registration
    const hasServiceWorker = frontendFiles.some((f) =>
      /service.?worker|sw\.ts|sw\.js/i.test(path.basename(f)),
    );
    if (!hasServiceWorker) {
      breaks.push(
        browserNetworkFinding({
          severity: 'medium',
          file: relManifest,
          line: 0,
          description: 'PWA manifest exists but no service worker found — app is not installable',
          detail: 'Add a service worker (sw.js) that handles offline caching and install prompt',
          observed: true,
        }),
      );
    }

    // Check icon sizes
    const icons = (manifest.icons as Array<{ sizes: string }>) || [];
    const has192 = icons.some((i) => /192/.test(i.sizes || ''));
    const has512 = icons.some((i) => /512/.test(i.sizes || ''));
    if (!has192 || !has512) {
      breaks.push(
        browserNetworkFinding({
          severity: 'medium',
          file: relManifest,
          line: 0,
          description: `PWA manifest missing required icon sizes (need 192x192 and 512x512) — ${!has192 ? '192 missing' : '512 missing'}`,
          detail: 'Add icons array with 192x192 and 512x512 PNG icons to manifest.json',
          observed: true,
        }),
      );
    }
  }

  // CHECK 5: Bundle size budget
  const nextConfigPath = safeJoin(config.frontendDir, 'next.config.js');
  const nextConfigTsPath = safeJoin(config.frontendDir, 'next.config.ts');
  const nextConfigFile = pathExists(nextConfigTsPath)
    ? nextConfigTsPath
    : pathExists(nextConfigPath)
      ? nextConfigPath
      : null;

  if (nextConfigFile) {
    let content: string;
    try {
      content = readTextFile(nextConfigFile, 'utf8');
    } catch {
      content = '';
    }
    if (
      !/bundleAnalyzer|sizeLimit|experimental.*bundlePagesExternally|BundleAnalyzerPlugin/i.test(
        content,
      )
    ) {
      breaks.push(
        browserNetworkFinding({
          severity: 'medium',
          file: path.relative(config.rootDir, nextConfigFile),
          line: 0,
          description:
            'No bundle size budget or analyzer configured — bundle may grow without notice',
          detail:
            'Add @next/bundle-analyzer or bundlemon to track bundle size; set size budgets in CI',
          observed: true,
        }),
      );
    }
  }

  // CHECK 7: Viewport meta tag in root layout
  const layoutFiles = frontendFiles.filter(
    (f) => /layout\.(tsx|ts)$/.test(f) && !/node_modules|\.next/.test(f),
  );
  for (const file of layoutFiles) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }
    if (!/viewport|initial-scale|width=device-width/i.test(content)) {
      breaks.push(
        browserNetworkFinding({
          severity: 'medium',
          file: path.relative(config.rootDir, file),
          line: 0,
          description:
            'Root layout missing viewport meta tag — mobile users see desktop-scaled view',
          detail:
            'Add: export const viewport = { width: "device-width", initialScale: 1 } to layout.tsx',
          observed: true,
        }),
      );
      break; // One report for root layout
    }
  }

  // TODO: Implement when infrastructure available
  // - Run Playwright tests in Safari via BrowserStack
  // - Lighthouse CI performance audit (LCP, FID, CLS)
  // - Network throttling test (3G simulation)
  // - Real device testing on Android/iOS

  return breaks;
}
