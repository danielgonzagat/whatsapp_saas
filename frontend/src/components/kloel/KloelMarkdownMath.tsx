'use client';

import { KLOEL_THEME } from '@/lib/kloel-theme';
import { loadKatex } from './KloelMarkdownCdn';
import DOMPurify from 'dompurify';
import { useEffect, useMemo, useState } from 'react';
import type { Plugin } from 'unified';
import { visit, SKIP } from 'unist-util-visit';
import { buildFallbackMathHtml, KATEX_PURIFY } from './KloelMarkdownMathFallback';
import { useClientMounted } from './KloelMarkdownClient';

export const MATH_INLINE_CLASS = 'language-math-inline';
export const MATH_DISPLAY_CLASS = 'language-math-display';

interface MarkdownTextNode {
  type: 'text';
  value: string;
}

interface MarkdownParentNode {
  children: Array<MarkdownTextNode | MathCodeNode | unknown>;
}

/** A KaTeX render keyed by the exact source it was produced from (stale-guard). */
interface KatexResult {
  source: string;
  display: boolean;
  html: string;
}

/** Render an isolated `$…$` / `$$…$$` math node as sanitized, styled HTML. */
export function KloelMath({ source, display }: { source: string; display: boolean }) {
  const mounted = useClientMounted();
  // SSR-safe built-in renderer; the displayed HTML upgrades to KaTeX once loaded.
  const fallbackHtml = useMemo(() => buildFallbackMathHtml(source), [source]);
  const [katexResult, setKatexResult] = useState<KatexResult | null>(null);

  useEffect(() => {
    if (!mounted) {
      return;
    }
    let cancelled = false;
    void loadKatex().then((katex) => {
      if (cancelled || !katex) {
        // CDN unreachable → keep the graceful built-in fallback already shown.
        return;
      }
      let rendered: string;
      try {
        rendered = katex.renderToString(source.trim(), {
          displayMode: display,
          throwOnError: false,
          output: 'htmlAndMathml',
          strict: 'ignore',
          trust: false,
        });
      } catch {
        return; // keep fallback on KaTeX parse errors
      }
      const clean = DOMPurify.sanitize(rendered, KATEX_PURIFY);
      if (!cancelled && clean) {
        setKatexResult({ source, display, html: clean });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [mounted, source, display]);

  // Derive the displayed HTML: use KaTeX only if it matches the current source
  // (so a source change before the next render falls back, never shows stale math).
  const katexLoaded =
    katexResult !== null && katexResult.source === source && katexResult.display === display;
  const html = katexLoaded ? katexResult.html : fallbackHtml;

  const sharedStyle = {
    fontFamily: "'Cambria Math', 'Latin Modern Math', 'STIX Two Math', 'Times New Roman', serif",
    fontStyle: 'italic' as const,
    color: KLOEL_THEME.textPrimary,
  };

  if (display) {
    return (
      <span
        className="kloel-math kloel-math-display"
        data-katex={katexLoaded ? 'true' : undefined}
        style={{
          ...sharedStyle,
          display: 'block',
          margin: '14px 0',
          padding: '6px 0',
          textAlign: 'center',
          fontSize: 16,
          overflowX: 'auto',
        }}
        // Sanitized above with DOMPurify — no script/handler/event-attr survives.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <span
      className="kloel-math kloel-math-inline"
      data-katex={katexLoaded ? 'true' : undefined}
      style={{ ...sharedStyle, fontSize: '0.97em' }}
      // Sanitized above with DOMPurify — no script/handler/event-attr survives.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/**
 * remark plugin: isolate inline `$…$` and block `$$…$$` math out of text nodes
 * into dedicated `code` nodes flagged with a math className. Keeping them as
 * `code` (a tag the renderer already maps) means full type-safety with no custom
 * JSX intrinsic. Escaped `\$` and bare `$` with no closing delimiter are left
 * untouched, matching common Markdown-math conventions.
 */
export const remarkKloelMath: Plugin<[]> = () => {
  const BLOCK_RE = /\$\$([\s\S]+?)\$\$/;
  // Inline: a single $, not escaped, not a $$, closed by a single $ on the same logical run.
  const INLINE_RE = /(?<![\\$])\$(?!\$)((?:\\.|[^$\\])+?)\$(?!\$)/;

  return (tree) => {
    visit(tree, 'text', (node, index, parent) => {
      const textNode = node as MarkdownTextNode;
      const textParent = parent as MarkdownParentNode | undefined;
      if (!textParent || typeof index !== 'number') {
        return undefined;
      }
      const value = textNode.value;
      if (!value.includes('$')) {
        return undefined;
      }

      const pieces: Array<MarkdownTextNode | MathCodeNode> = [];
      let rest = value;
      let mutated = false;

      // Greedily consume block then inline math, left to right. Each iteration
      // strips the next math run from `rest`; the loop ends when none remain.
      const nextMatch = (): { match: RegExpExecArray; display: boolean } | null => {
        const block = BLOCK_RE.exec(rest);
        const inline = INLINE_RE.exec(rest);
        if (block && (!inline || block.index <= inline.index)) {
          return { match: block, display: true };
        }
        if (inline) {
          return { match: inline, display: false };
        }
        return null;
      };

      for (let found = nextMatch(); found !== null; found = nextMatch()) {
        mutated = true;
        const { match, display } = found;
        const before = rest.slice(0, match.index);
        if (before) {
          pieces.push({ type: 'text', value: before });
        }
        pieces.push(makeMathNode(match[1] ?? '', display));
        rest = rest.slice(match.index + match[0].length);
      }

      if (!mutated) {
        return undefined;
      }
      if (rest) {
        pieces.push({ type: 'text', value: rest });
      }

      textParent.children.splice(index, 1, ...(pieces as MarkdownTextNode[]));
      return [SKIP, index + pieces.length];
    });
  };
};

/** mdast `code` node carrying math source, rendered by the `code` component. */
interface MathCodeNode {
  type: 'inlineCode';
  value: string;
  data: { hName: 'code'; hProperties: { className: string[] } };
}

function makeMathNode(source: string, display: boolean): MathCodeNode {
  return {
    type: 'inlineCode',
    value: source,
    data: {
      hName: 'code',
      hProperties: { className: [display ? MATH_DISPLAY_CLASS : MATH_INLINE_CLASS] },
    },
  };
}
