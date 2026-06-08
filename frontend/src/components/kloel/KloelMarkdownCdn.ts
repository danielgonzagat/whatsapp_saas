/**
 * Runtime CDN loaders for the heavy math/diagram renderers used by
 * {@link ./KloelMarkdown}. The build cannot add npm dependencies (the npm cache is
 * root-owned, so installs are blocked), so KaTeX and Mermaid are lazy-loaded from
 * a CDN at runtime instead of bundled.
 *
 * Every loader is:
 *   - SSR-safe: returns `null` immediately when `window` is undefined.
 *   - Idempotent: the underlying `<script>`/`<link>` is injected at most once and
 *     the in-flight load promise is cached, so N concurrent callers share one load.
 *   - Fail-graceful: a network/CDN error resolves to `null` (never throws), so the
 *     caller can fall back to its built-in renderer or to raw text.
 *
 * Only the narrow slices of each library's API that this app uses are typed here;
 * there is intentionally no global `Window` augmentation so this stays contained
 * to the markdown renderer track.
 */

// ── KaTeX ─────────────────────────────────────────────────────────────────────

/** Pinned KaTeX version + integrity-free CDN URLs (jsDelivr). */
const KATEX_VERSION = '0.16.11';
const KATEX_SCRIPT_URL = `https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist/katex.min.js`;
const KATEX_CSS_URL = `https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist/katex.min.css`;
const KATEX_SCRIPT_ID = 'kloel-katex-cdn';
const KATEX_CSS_ID = 'kloel-katex-css-cdn';

/** Options accepted by `katex.renderToString` (the subset this app passes). */
export interface KatexRenderOptions {
  displayMode?: boolean;
  throwOnError?: boolean;
  output?: 'html' | 'mathml' | 'htmlAndMathml';
  trust?: boolean;
  strict?: boolean | 'ignore' | 'warn' | 'error';
}

/** The narrow KaTeX surface this app relies on. */
export interface KatexApi {
  renderToString: (tex: string, options?: KatexRenderOptions) => string;
}

/** Mermaid `render` result (UMD shape across v9/v10). */
export interface MermaidRenderResult {
  svg: string;
}

/** Mermaid initialize config (only the keys this app sets). */
export interface MermaidInitializeConfig {
  startOnLoad?: boolean;
  securityLevel?: 'strict' | 'loose' | 'antiscript' | 'sandbox';
  theme?: 'default' | 'dark' | 'forest' | 'neutral' | 'base' | 'null';
  fontFamily?: string;
}

/** The narrow Mermaid surface this app relies on. */
export interface MermaidApi {
  initialize: (config: MermaidInitializeConfig) => void;
  /**
   * v10 returns a Promise; v9 returns the svg synchronously and uses a callback.
   * We always `await` the result so both shapes are handled by the caller.
   */
  render: (
    id: string,
    text: string,
  ) => Promise<MermaidRenderResult> | MermaidRenderResult | string;
}

/** Read a typed library global off `window` without polluting the global scope. */
function readGlobal<T>(key: string): T | undefined {
  return Reflect.get(window, key) as T | undefined;
}

/**
 * Inject a `<script src>` once (keyed by `id`) and resolve when it loads.
 * Resolves `false` (never rejects) on load error so callers degrade gracefully.
 * A re-injection of an already-present, already-loaded tag short-circuits to `true`.
 */
function injectScriptOnce(id: string, src: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const existing = document.getElementById(id);
    if (existing instanceof HTMLScriptElement) {
      if (existing.dataset.loaded === 'true') {
        resolve(true);
        return;
      }
      if (existing.dataset.failed === 'true') {
        resolve(false);
        return;
      }
      existing.addEventListener('load', () => resolve(true), { once: true });
      existing.addEventListener('error', () => resolve(false), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.addEventListener(
      'load',
      () => {
        script.dataset.loaded = 'true';
        resolve(true);
      },
      { once: true },
    );
    script.addEventListener(
      'error',
      () => {
        script.dataset.failed = 'true';
        resolve(false);
      },
      { once: true },
    );
    document.head.appendChild(script);
  });
}

/** Inject a stylesheet `<link>` once (keyed by `id`). Best-effort, never throws. */
function injectStylesheetOnce(id: string, href: string): void {
  if (document.getElementById(id)) {
    return;
  }
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = href;
  link.crossOrigin = 'anonymous';
  document.head.appendChild(link);
}

let katexPromise: Promise<KatexApi | null> | null = null;

/**
 * Lazy-load KaTeX from the CDN and resolve its API, or `null` if unavailable
 * (SSR, CDN unreachable, or the global never materialised). Idempotent: repeated
 * calls share one in-flight load and one injected `<script>`/`<link>`.
 */
export function loadKatex(): Promise<KatexApi | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve(null);
  }
  const present = readGlobal<KatexApi>('katex');
  if (present && typeof present.renderToString === 'function') {
    return Promise.resolve(present);
  }
  if (katexPromise) {
    return katexPromise;
  }
  katexPromise = (async () => {
    injectStylesheetOnce(KATEX_CSS_ID, KATEX_CSS_URL);
    const ok = await injectScriptOnce(KATEX_SCRIPT_ID, KATEX_SCRIPT_URL);
    if (!ok) {
      katexPromise = null; // allow a later retry
      return null;
    }
    const api = readGlobal<KatexApi>('katex');
    if (!api || typeof api.renderToString !== 'function') {
      katexPromise = null;
      return null;
    }
    return api;
  })();
  return katexPromise;
}

// ── Mermaid ───────────────────────────────────────────────────────────────────

const MERMAID_VERSION = '10.9.1';
const MERMAID_SCRIPT_URL = `https://cdn.jsdelivr.net/npm/mermaid@${MERMAID_VERSION}/dist/mermaid.min.js`;
const MERMAID_SCRIPT_ID = 'kloel-mermaid-cdn';

let mermaidPromise: Promise<MermaidApi | null> | null = null;
let mermaidInitialised = false;

function ensureMermaidInitialised(api: MermaidApi): void {
  if (mermaidInitialised) {
    return;
  }
  // `securityLevel: 'strict'` makes mermaid HTML-escape labels and refuse
  // click/script directives; output is still DOMPurified by the caller.
  api.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'dark',
    fontFamily: "'Sora', sans-serif",
  });
  mermaidInitialised = true;
}

/**
 * Lazy-load Mermaid (UMD) from the CDN, initialise it once with strict security,
 * and resolve its API — or `null` if unavailable. Idempotent across callers.
 */
export function loadMermaid(): Promise<MermaidApi | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve(null);
  }
  const present = readGlobal<MermaidApi>('mermaid');
  if (present && typeof present.render === 'function') {
    ensureMermaidInitialised(present);
    return Promise.resolve(present);
  }
  if (mermaidPromise) {
    return mermaidPromise;
  }
  mermaidPromise = (async () => {
    const ok = await injectScriptOnce(MERMAID_SCRIPT_ID, MERMAID_SCRIPT_URL);
    if (!ok) {
      mermaidPromise = null;
      return null;
    }
    const api = readGlobal<MermaidApi>('mermaid');
    if (!api || typeof api.render !== 'function') {
      mermaidPromise = null;
      return null;
    }
    ensureMermaidInitialised(api);
    return api;
  })();
  return mermaidPromise;
}

/** Normalise mermaid `render` across v9/v10 return shapes into an svg string. */
export async function renderMermaidWithApi(
  api: MermaidApi,
  id: string,
  text: string,
): Promise<string | null> {
  try {
    const out = await api.render(id, text);
    if (typeof out === 'string') {
      return out;
    }
    if (out && typeof out.svg === 'string') {
      return out.svg;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Reset cached loader state. Test-only: lets a spec re-exercise the load path
 * with a freshly mocked global. Never called in production code.
 */
export function __resetCdnLoadersForTest(): void {
  katexPromise = null;
  mermaidPromise = null;
  mermaidInitialised = false;
}
