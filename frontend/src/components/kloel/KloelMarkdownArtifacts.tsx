'use client';

import { KLOEL_THEME } from '@/lib/kloel-theme';
import DOMPurify from 'dompurify';
import { useMemo } from 'react';
import { useClientMounted } from './KloelMarkdownClient';

const BORDER = KLOEL_THEME.borderPrimary;

/** Render a model-emitted ```svg block as a real, sanitized SVG artifact. */
export function SvgArtifact({ source }: { source: string }) {
  const mounted = useClientMounted();
  const html = useMemo(() => {
    if (!mounted) {
      return '';
    }
    // Sanitize on the client only (DOMPurify needs window): strips <script>,
    // event handlers and foreignObject so model-authored SVG cannot execute.
    return DOMPurify.sanitize(source, { USE_PROFILES: { svg: true, svgFilters: true } });
  }, [mounted, source]);

  if (!html) {
    return null;
  }
  return (
    <div
      className="kloel-artifact-svg"
      style={{ display: 'flex', justifyContent: 'center', width: '100%', overflow: 'auto' }}
      // Sanitized above with DOMPurify (svg profile) — no script/handlers survive.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// ── HTML artifact ───────────────────────────────────────────────────────────────

/**
 * Render a model-emitted ```html block as a sandboxed artifact. The HTML runs
 * inside an <iframe sandbox> with `allow-scripts` but WITHOUT `allow-same-origin`,
 * so the document is forced into a unique opaque origin: it can never read the
 * parent's cookies, localStorage, tokens, or DOM. `srcdoc` keeps it inline (no
 * network), and the content is DOMPurified first so obvious script payloads are
 * stripped even before the sandbox boundary.
 */
export function HtmlArtifact({ source }: { source: string }) {
  const mounted = useClientMounted();

  const doc = useMemo<string | null>(() => {
    if (!mounted) {
      return null;
    }
    // Strip scripts/handlers up front; the sandbox is the second line of defence.
    const clean = DOMPurify.sanitize(source, {
      FORBID_TAGS: ['script', 'base', 'form'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick'],
      ADD_ATTR: ['target'],
      WHOLE_DOCUMENT: false,
    });
    return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>:root{color-scheme:light dark}body{margin:0;padding:12px;font-family:'Sora',sans-serif;color:rgb(17,17,17);background:transparent}</style></head><body>${clean}</body></html>`;
  }, [mounted, source]);

  if (doc === null) {
    return null;
  }

  return (
    <iframe
      className="kloel-artifact-html"
      title="Conteúdo HTML"
      // No allow-same-origin ⇒ opaque origin ⇒ no access to parent cookies/storage/tokens.
      sandbox="allow-scripts"
      srcDoc={doc}
      style={{
        width: '100%',
        minHeight: 180,
        margin: '14px 0',
        border: `1px solid ${BORDER}`,
        borderRadius: 6,
        background: KLOEL_THEME.bgSecondary,
      }}
    />
  );
}
