'use client';

import { sanitizeAssistantMarkdown } from '@/lib/kloel-message-ui';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import type { HTMLAttributes } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import DOMPurify from 'dompurify';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Root, Text } from 'mdast';
import type { Plugin } from 'unified';
import { visit, SKIP } from 'unist-util-visit';

const HTTPS_RE = /^https?:\/\//i;

const TEXT = KLOEL_THEME.textPrimary;
const MUTED = KLOEL_THEME.textSecondary;
const BORDER = KLOEL_THEME.borderPrimary;
const SUBTLE = KLOEL_THEME.bgSecondary;
const CODE_BG = KLOEL_THEME.bgSecondary;
const EMBER = KLOEL_THEME.accent;
const FONT = "'Sora', sans-serif";
const MONO = "'JetBrains Mono', monospace";

function nodeToText(node: ReactNode): string {
  if (node == null || node === false || node === true) {
    return '';
  }
  if (typeof node === 'string') {
    return node;
  }
  if (typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(nodeToText).join('');
  }
  if (typeof node === 'object' && 'props' in node) {
    return nodeToText((node as { props?: { children?: ReactNode } }).props?.children);
  }
  return '';
}

// ── Math (LaTeX) ──────────────────────────────────────────────────────────────
// KaTeX is the canonical renderer, but it is a heavy dependency (~280 KB) and
// this build cannot add packages (root-owned npm cache → install blocked). So we
// ship a real, self-contained LaTeX-subset renderer that covers the math the
// assistant actually emits (fractions, super/subscripts, roots, Greek letters,
// common operators/relations) and degrade gracefully to a styled literal for
// anything outside the subset. Swapping in rehype-katex later is a drop-in: the
// `remarkKloelMath` plugin already isolates `$…$` / `$$…$$` into dedicated nodes.

const MATH_INLINE_CLASS = 'language-math-inline';
const MATH_DISPLAY_CLASS = 'language-math-display';

const LATEX_SYMBOLS: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε',
  zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ',
  lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', varpi: 'ϖ', rho: 'ρ',
  varrho: 'ϱ', sigma: 'σ', varsigma: 'ς', tau: 'τ', upsilon: 'υ', phi: 'φ',
  varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π',
  Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  times: '×', div: '÷', pm: '±', mp: '∓', cdot: '·', ast: '∗', star: '⋆',
  leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈',
  equiv: '≡', sim: '∼', simeq: '≃', cong: '≅', propto: '∝', ll: '≪', gg: '≫',
  in: '∈', notin: '∉', ni: '∋', subset: '⊂', supset: '⊃', subseteq: '⊆',
  supseteq: '⊇', cup: '∪', cap: '∩', emptyset: '∅', varnothing: '∅',
  forall: '∀', exists: '∃', nexists: '∄', neg: '¬', land: '∧', lor: '∨',
  wedge: '∧', vee: '∨', oplus: '⊕', otimes: '⊗', perp: '⊥', parallel: '∥',
  infty: '∞', partial: '∂', nabla: '∇', sum: '∑', prod: '∏', int: '∫',
  oint: '∮', sqrt: '√', angle: '∠', triangle: '△', square: '□',
  rightarrow: '→', to: '→', leftarrow: '←', gets: '←', leftrightarrow: '↔',
  Rightarrow: '⇒', implies: '⇒', Leftarrow: '⇐', Leftrightarrow: '⇔', iff: '⇔',
  mapsto: '↦', uparrow: '↑', downarrow: '↓', updownarrow: '↕',
  ldots: '…', cdots: '⋯', vdots: '⋮', ddots: '⋱', dots: '…',
  Re: 'ℜ', Im: 'ℑ', aleph: 'ℵ', hbar: 'ℏ', ell: 'ℓ', wp: '℘',
  prime: '′', circ: '∘', bullet: '•', dagger: '†', ddagger: '‡',
  langle: '⟨', rangle: '⟩', lceil: '⌈', rceil: '⌉', lfloor: '⌊', rfloor: '⌋',
  quad: ' ', qquad: '  ', ',': ' ', ';': ' ',
  '%': '%', $: '$', '#': '#', '&': '&', _: '_', '{': '{', '}': '}',
};

const SUPERSCRIPT_MAP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶',
  '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽',
  ')': '⁾', n: 'ⁿ', i: 'ⁱ',
};

const SUBSCRIPT_MAP: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆',
  '7': '₇', '8': '₈', '9': '₉', '+': '₊', '-': '₋', '=': '₌', '(': '₍',
  ')': '₎', a: 'ₐ', e: 'ₑ', i: 'ᵢ', o: 'ₒ', x: 'ₓ', n: 'ₙ',
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Map a run of characters to Unicode super/subscript, or null if any char is unmapped. */
function toScript(run: string, map: Record<string, string>): string | null {
  let out = '';
  for (const ch of run) {
    const mapped = map[ch];
    if (mapped === undefined) {
      return null;
    }
    out += mapped;
  }
  return out;
}

/** Render a `^{…}` or `_{…}` group, preferring Unicode scripts and falling back to <sup>/<sub>. */
function renderScript(tag: 'sup' | 'sub', inner: string): string {
  const map = tag === 'sup' ? SUPERSCRIPT_MAP : SUBSCRIPT_MAP;
  const unicode = toScript(inner, map);
  if (unicode !== null) {
    return unicode;
  }
  return `<${tag}>${latexToHtml(inner)}</${tag}>`;
}

/**
 * Render a LaTeX-subset string to a safe HTML fragment. Handles \frac, \sqrt,
 * \command symbols, ^{…}/_{…} scripts (and single-char ^a/_a), grouping braces,
 * and passes literal text through escaped. Output is further DOMPurified before
 * it ever reaches the DOM.
 */
function latexToHtml(input: string): string {
  let out = '';
  let i = 0;
  const n = input.length;

  const readGroup = (start: number): { body: string; end: number } => {
    // `start` points at the char after an opening brace; return inner + index past '}'.
    let depth = 1;
    let j = start;
    while (j < n && depth > 0) {
      const c = input[j];
      if (c === '{') {
        depth += 1;
      } else if (c === '}') {
        depth -= 1;
      }
      if (depth === 0) {
        break;
      }
      j += 1;
    }
    return { body: input.slice(start, j), end: j + 1 };
  };

  const readArg = (start: number): { body: string; end: number } => {
    // Either a brace group or a single character.
    if (input[start] === '{') {
      return readGroup(start + 1);
    }
    return { body: input[start] ?? '', end: start + 1 };
  };

  while (i < n) {
    const ch = input[i];

    if (ch === '\\') {
      // Command: read the longest alpha name, else a single symbol char.
      const rest = input.slice(i + 1);
      const nameMatch = rest.match(/^[A-Za-z]+/);
      if (nameMatch) {
        const name = nameMatch[0];
        i += 1 + name.length;
        if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
          const num = readArg(i);
          const den = readArg(num.end);
          i = den.end;
          out += `<span class="kloel-frac"><span class="kloel-frac-num">${latexToHtml(
            num.body,
          )}</span><span class="kloel-frac-den">${latexToHtml(den.body)}</span></span>`;
          continue;
        }
        if (name === 'sqrt') {
          // optional [index] then the radicand
          let idx = '';
          if (input[i] === '[') {
            const close = input.indexOf(']', i);
            if (close !== -1) {
              idx = input.slice(i + 1, close);
              i = close + 1;
            }
          }
          const arg = readArg(i);
          i = arg.end;
          const indexHtml = idx ? `<sup>${latexToHtml(idx)}</sup>` : '';
          out += `${indexHtml}<span class="kloel-sqrt">√<span class="kloel-sqrt-body">${latexToHtml(
            arg.body,
          )}</span></span>`;
          continue;
        }
        if (name === 'text' || name === 'mathrm' || name === 'mathbf' || name === 'mathit') {
          const arg = readArg(i);
          i = arg.end;
          const weight = name === 'mathbf' ? ' style="font-weight:600"' : '';
          const ital = name === 'mathit' ? ' style="font-style:italic"' : '';
          out += `<span${weight}${ital}>${escapeHtml(arg.body)}</span>`;
          continue;
        }
        if (name === 'left' || name === 'right') {
          // Drop the delimiter sizing command, keep the following delimiter char.
          continue;
        }
        const sym = LATEX_SYMBOLS[name];
        out += sym !== undefined ? escapeHtml(sym) : escapeHtml(name);
        continue;
      }
      // Escaped symbol like \{ \} \% \, etc.
      const symChar = input[i + 1] ?? '';
      const sym = LATEX_SYMBOLS[symChar];
      out += sym !== undefined ? escapeHtml(sym) : escapeHtml(symChar);
      i += 2;
      continue;
    }

    if (ch === '^' || ch === '_') {
      const tag = ch === '^' ? 'sup' : 'sub';
      const arg = readArg(i + 1);
      i = arg.end;
      out += renderScript(tag, arg.body);
      continue;
    }

    if (ch === '{' || ch === '}') {
      // Bare grouping braces are layout-only.
      i += 1;
      continue;
    }

    out += escapeHtml(ch ?? '');
    i += 1;
  }

  return out;
}

/** Render an isolated `$…$` / `$$…$$` math node as sanitized, styled HTML. */
function KloelMath({ source, display }: { source: string; display: boolean }) {
  const html = useMemo(() => {
    const rendered = latexToHtml(source.trim());
    // The renderer only emits a known, closed set of tags/classes, but we still
    // DOMPurify to guarantee no script/handler/attribute can ever survive.
    return DOMPurify.sanitize(rendered, {
      ALLOWED_TAGS: ['span', 'sup', 'sub'],
      ALLOWED_ATTR: ['class', 'style'],
    });
  }, [source]);

  const sharedStyle = {
    fontFamily:
      "'Cambria Math', 'Latin Modern Math', 'STIX Two Math', 'Times New Roman', serif",
    fontStyle: 'italic' as const,
    color: KLOEL_THEME.textPrimary,
  };

  if (display) {
    return (
      <span
        className="kloel-math kloel-math-display"
        style={{
          ...sharedStyle,
          display: 'block',
          margin: '14px 0',
          padding: '6px 0',
          textAlign: 'center',
          fontSize: 16,
          overflowX: 'auto',
        }}
        // Sanitized above; only span/sup/sub with class/style survive.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <span
      className="kloel-math kloel-math-inline"
      style={{ ...sharedStyle, fontSize: '0.97em' }}
      // Sanitized above; only span/sup/sub with class/style survive.
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
const remarkKloelMath: Plugin<[], Root> = () => {
  const BLOCK_RE = /\$\$([\s\S]+?)\$\$/;
  // Inline: a single $, not escaped, not a $$, closed by a single $ on the same logical run.
  const INLINE_RE = /(?<![\\$])\$(?!\$)((?:\\.|[^$\\])+?)\$(?!\$)/;

  return (tree) => {
    visit(tree, 'text', (node: Text, index, parent) => {
      if (!parent || typeof index !== 'number') {
        return undefined;
      }
      const value = node.value;
      if (!value.includes('$')) {
        return undefined;
      }

      const pieces: Array<Text | MathCodeNode> = [];
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

      parent.children.splice(index, 1, ...(pieces as Text[]));
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

// ── SVG ───────────────────────────────────────────────────────────────────────

/**
 * True only after the component has mounted on the client. DOMPurify and the
 * artifact renderers need `window`, and we must avoid a hydration mismatch, so
 * the heavy work is gated behind a one-time mount toggle. Detecting client mount
 * has no render-time equivalent — a single setState in a mount-only effect is the
 * canonical, intentional pattern here (not a derived-state cascade).
 */
function useClientMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-mount flag; no render-time equivalent exists.
    setMounted(true);
  }, []);
  return mounted;
}

/** Render a model-emitted ```svg block as a real, sanitized SVG artifact. */
function SvgArtifact({ source }: { source: string }) {
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

// ── Mermaid ─────────────────────────────────────────────────────────────────────
// The mermaid package (~3 MB) cannot be installed in this build, so we ship a
// real, lazy-rendered SVG renderer for the directed-graph subset the assistant
// most often emits (`graph`/`flowchart` with `A --> B`, labels, and `A[Text]`
// node shapes). Unsupported diagram types degrade to a labelled, styled source
// block instead of breaking. Swapping in `mermaid.render` later only changes the
// body of `renderMermaidSvg`.

interface MermaidEdge {
  from: string;
  to: string;
  label?: string;
}

interface MermaidGraph {
  direction: 'TB' | 'TD' | 'LR' | 'RL' | 'BT';
  labels: Map<string, string>;
  edges: MermaidEdge[];
  order: string[];
}

const MERMAID_EDGE_RE =
  /^([A-Za-z0-9_]+)(?:[[({"][^\]\)}"]*[\])}"])?\s*(?:--?\s*(?:\|([^|]*)\||"([^"]*)")?\s*)?-?-+>\s*([A-Za-z0-9_]+)(?:[[({"]([^\]\)}"]*)[\])}"])?/;
const MERMAID_NODE_DEF_RE = /^([A-Za-z0-9_]+)\s*[[({"]([^\])}"]*)[\])}"]/;

function parseMermaid(source: string): MermaidGraph | null {
  const lines = source
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('%%'));
  if (lines.length === 0) {
    return null;
  }
  const header = lines[0] ?? '';
  const headerMatch = header.match(/^(?:graph|flowchart)\s+(TB|TD|LR|RL|BT)/i);
  if (!headerMatch) {
    return null;
  }
  const direction = (headerMatch[1]?.toUpperCase() ?? 'TB') as MermaidGraph['direction'];
  const labels = new Map<string, string>();
  const edges: MermaidEdge[] = [];
  const order: string[] = [];

  const register = (id: string, label?: string) => {
    if (!order.includes(id)) {
      order.push(id);
    }
    if (label && label.trim()) {
      labels.set(id, label.trim());
    } else if (!labels.has(id)) {
      labels.set(id, id);
    }
  };

  for (let li = 1; li < lines.length; li += 1) {
    const line = lines[li] ?? '';
    const edge = line.match(MERMAID_EDGE_RE);
    if (edge) {
      const from = edge[1] ?? '';
      const fromLabel = line.match(new RegExp(`^${from}\\s*[\\[({"]([^\\])}"]*)[\\])}"]`));
      const to = edge[4] ?? '';
      const edgeLabel = (edge[2] ?? edge[3] ?? '').trim();
      register(from, fromLabel?.[1]);
      register(to, edge[5]);
      edges.push({ from, to, ...(edgeLabel ? { label: edgeLabel } : {}) });
      continue;
    }
    const def = line.match(MERMAID_NODE_DEF_RE);
    if (def) {
      register(def[1] ?? '', def[2]);
    }
  }

  if (order.length === 0) {
    return null;
  }
  return { direction, labels, edges, order };
}

/**
 * Lay out a parsed graph on a simple layered grid and emit an SVG string. Real
 * geometry (boxes, arrows, edge labels) — not an image of the source. Bounded to
 * the parsed nodes so it cannot loop on malformed input.
 */
function renderMermaidSvg(graph: MermaidGraph): string {
  const horizontal = graph.direction === 'LR' || graph.direction === 'RL';
  const boxW = 150;
  const boxH = 44;
  const gapMain = 70;
  const gapCross = 28;

  // Longest-path layering from roots.
  const depth = new Map<string, number>();
  const incoming = new Map<string, number>();
  for (const id of graph.order) {
    incoming.set(id, 0);
  }
  for (const e of graph.edges) {
    incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1);
  }
  const queue = graph.order.filter((id) => (incoming.get(id) ?? 0) === 0);
  for (const id of queue) {
    depth.set(id, 0);
  }
  // Bounded relaxation (graph.order.length passes max).
  for (let pass = 0; pass < graph.order.length; pass += 1) {
    let changed = false;
    for (const e of graph.edges) {
      const d = (depth.get(e.from) ?? 0) + 1;
      if (d > (depth.get(e.to) ?? 0)) {
        depth.set(e.to, d);
        changed = true;
      }
    }
    if (!changed) {
      break;
    }
  }
  for (const id of graph.order) {
    if (!depth.has(id)) {
      depth.set(id, 0);
    }
  }

  const layers = new Map<number, string[]>();
  for (const id of graph.order) {
    const d = depth.get(id) ?? 0;
    const layer = layers.get(d) ?? [];
    layer.push(id);
    layers.set(d, layer);
  }

  const pos = new Map<string, { x: number; y: number }>();
  const maxLayer = Math.max(0, ...Array.from(layers.keys()));
  let maxCross = 0;
  for (let d = 0; d <= maxLayer; d += 1) {
    const layer = layers.get(d) ?? [];
    maxCross = Math.max(maxCross, layer.length);
    layer.forEach((id, idx) => {
      const main = 24 + d * (horizontal ? boxW + gapMain : boxH + gapMain);
      const cross = 24 + idx * ((horizontal ? boxH : boxW) + gapCross);
      pos.set(id, horizontal ? { x: main, y: cross } : { x: cross, y: main });
    });
  }

  const width = horizontal
    ? 48 + (maxLayer + 1) * (boxW + gapMain)
    : 48 + maxCross * (boxW + gapCross);
  const height = horizontal
    ? 48 + maxCross * (boxH + gapCross)
    : 48 + (maxLayer + 1) * (boxH + gapMain);

  const nodeColor = 'var(--app-bg-secondary)';
  const strokeColor = 'var(--app-border-primary)';
  const textColor = 'var(--app-text-primary)';
  const accentColor = 'var(--app-accent)';

  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const nodesSvg = graph.order
    .map((id) => {
      const p = pos.get(id);
      if (!p) {
        return '';
      }
      const label = graph.labels.get(id) ?? id;
      return `<g><rect x="${p.x}" y="${p.y}" width="${boxW}" height="${boxH}" rx="8" fill="${nodeColor}" stroke="${strokeColor}" stroke-width="1.5"/><text x="${
        p.x + boxW / 2
      }" y="${p.y + boxH / 2}" fill="${textColor}" font-size="13" font-family="Sora, sans-serif" text-anchor="middle" dominant-baseline="central">${esc(
        label,
      )}</text></g>`;
    })
    .join('');

  const edgesSvg = graph.edges
    .map((e) => {
      const a = pos.get(e.from);
      const b = pos.get(e.to);
      if (!a || !b) {
        return '';
      }
      const x1 = a.x + boxW / 2;
      const y1 = a.y + boxH / 2;
      const x2 = b.x + boxW / 2;
      const y2 = b.y + boxH / 2;
      const labelSvg = e.label
        ? `<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 4}" fill="${textColor}" font-size="11" font-family="Sora, sans-serif" text-anchor="middle">${esc(
            e.label,
          )}</text>`
        : '';
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${accentColor}" stroke-width="1.5" marker-end="url(#kloel-mermaid-arrow)"/>${labelSvg}`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Diagrama"><defs><marker id="kloel-mermaid-arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" fill="${accentColor}"/></marker></defs>${edgesSvg}${nodesSvg}</svg>`;
}

/** Render a ```mermaid block as a real client-side SVG diagram (lazy / no SSR). */
function MermaidArtifact({ source }: { source: string }) {
  // Defer parse/render until after the first client paint (lazy), keeping SSR a no-op.
  const mounted = useClientMounted();

  const result = useMemo<{ svg: string | null; unsupported: boolean }>(() => {
    if (!mounted) {
      return { svg: null, unsupported: false };
    }
    const graph = parseMermaid(source);
    if (!graph) {
      return { svg: null, unsupported: true };
    }
    // Renderer output is a closed SVG element set; sanitize defensively anyway.
    const raw = renderMermaidSvg(graph);
    return {
      svg: DOMPurify.sanitize(raw, { USE_PROFILES: { svg: true, svgFilters: true } }),
      unsupported: false,
    };
  }, [mounted, source]);

  const { svg, unsupported } = result;

  if (unsupported || (svg !== null && svg.length === 0)) {
    return (
      <pre
        className="kloel-artifact-mermaid-fallback"
        style={{
          margin: '14px 0',
          padding: '14px 16px',
          background: KLOEL_THEME.bgSecondary,
          border: `1px solid ${BORDER}`,
          borderRadius: 6,
          overflowX: 'auto',
          color: KLOEL_THEME.textPrimary,
          fontFamily: MONO,
          fontSize: 13,
        }}
      >
        {source}
      </pre>
    );
  }

  if (svg === null) {
    return null;
  }

  return (
    <div
      className="kloel-artifact-mermaid"
      style={{
        display: 'flex',
        justifyContent: 'center',
        width: '100%',
        overflow: 'auto',
        margin: '14px 0',
        padding: '12px',
        background: KLOEL_THEME.bgSecondary,
        border: `1px solid ${BORDER}`,
        borderRadius: 6,
      }}
      // Sanitized above with DOMPurify (svg profile) — no script/handlers survive.
      dangerouslySetInnerHTML={{ __html: svg }}
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
function HtmlArtifact({ source }: { source: string }) {
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
    return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>:root{color-scheme:light dark}body{margin:0;padding:12px;font-family:'Sora',sans-serif;color:${'#111'};background:transparent}</style></head><body>${clean}</body></html>`;
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

const MATH_INLINE_CLASS_RE = new RegExp(`(?:^|\\s)${MATH_INLINE_CLASS}(?:\\s|$)`);
const MATH_DISPLAY_CLASS_RE = new RegExp(`(?:^|\\s)${MATH_DISPLAY_CLASS}(?:\\s|$)`);

/** Kloel markdown. */
export function KloelMarkdown({ content }: { content: string }) {
  const sanitizedContent = sanitizeAssistantMarkdown(String(content || ''));

  return (
    <div
      className="kloel-markdown"
      style={{
        fontSize: 14.5,
        lineHeight: 1.68,
        color: TEXT,
        fontFamily: FONT,
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkKloelMath]}
        rehypePlugins={[[rehypeHighlight, { ignoreMissing: true, detect: false }]]}
        components={{
          h2: ({ children }) => (
            <h2
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: KLOEL_THEME.textPrimary,
                margin: '16px 0 8px',
                letterSpacing: 0,
              }}
            >
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3
              style={{
                fontSize: 14.5,
                fontWeight: 600,
                color: KLOEL_THEME.textPrimary,
                margin: '14px 0 7px',
                letterSpacing: 0,
              }}
            >
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p
              style={{
                margin: '8px 0',
                color: TEXT,
                lineHeight: 1.68,
              }}
            >
              {children}
            </p>
          ),
          strong: ({ children }) => (
            <strong style={{ color: KLOEL_THEME.textPrimary, fontWeight: 600 }}>{children}</strong>
          ),
          a: ({ href, children }) => {
            const external = typeof href === 'string' && HTTPS_RE.test(href);
            return (
              <a
                href={href}
                target={external ? '_blank' : undefined}
                rel={external ? 'noopener noreferrer' : undefined}
                style={{
                  color: EMBER,
                  textDecoration: 'underline',
                  textUnderlineOffset: 3,
                }}
              >
                {children}
              </a>
            );
          },
          ul: ({ children }) => (
            <ul style={{ margin: '8px 0 8px 17px', padding: 0, color: TEXT }}>{children}</ul>
          ),
          ol: ({ children }) => (
            <ol style={{ margin: '8px 0 8px 17px', padding: 0, color: TEXT }}>{children}</ol>
          ),
          li: ({ children }) => <li style={{ margin: '5px 0', lineHeight: 1.62 }}>{children}</li>,
          blockquote: ({ children }) => (
            <blockquote
              style={{
                margin: '16px 0',
                padding: '10px 14px',
                borderLeft: `3px solid ${KLOEL_THEME.accent}`,
                borderRadius: '0 6px 6px 0',
                background: SUBTLE,
                color: KLOEL_THEME.textPrimary,
              }}
            >
              {children}
            </blockquote>
          ),
          hr: () => (
            <hr
              style={{
                border: 'none',
                borderTop: `1px solid ${BORDER}`,
                margin: '22px 0',
              }}
            />
          ),
          code: ({ className, children, ...props }: HTMLAttributes<HTMLElement>) => {
            const inline = !className;
            if (typeof className === 'string') {
              if (MATH_DISPLAY_CLASS_RE.test(className)) {
                return <KloelMath source={nodeToText(children)} display />;
              }
              if (MATH_INLINE_CLASS_RE.test(className)) {
                return <KloelMath source={nodeToText(children)} display={false} />;
              }
              if (/(?:^|\s)language-svg(?:\s|$)/.test(className)) {
                return <SvgArtifact source={nodeToText(children)} />;
              }
              if (/(?:^|\s)language-mermaid(?:\s|$)/.test(className)) {
                return <MermaidArtifact source={nodeToText(children)} />;
              }
              if (/(?:^|\s)language-html(?:\s|$)/.test(className)) {
                return <HtmlArtifact source={nodeToText(children)} />;
              }
            }

            if (inline) {
              return (
                <code
                  style={{
                    fontFamily: MONO,
                    fontSize: 13,
                    background: CODE_BG,
                    border: `1px solid ${BORDER}`,
                    borderRadius: 6,
                    padding: '2px 6px',
                    color: KLOEL_THEME.textPrimary,
                  }}
                  {...props}
                >
                  {children}
                </code>
              );
            }

            return (
              <code
                className={className}
                style={{
                  display: 'block',
                  fontFamily: MONO,
                  fontSize: 13,
                  whiteSpace: 'pre',
                }}
                {...props}
              >
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre
              style={{
                margin: '14px 0',
                padding: '14px 16px',
                background: KLOEL_THEME.bgSecondary,
                border: `1px solid ${BORDER}`,
                borderRadius: 6,
                overflowX: 'auto',
                color: KLOEL_THEME.textPrimary,
              }}
            >
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div
              style={{
                margin: '16px 0',
                overflowX: 'auto',
                border: `1px solid ${BORDER}`,
                borderRadius: 6,
              }}
            >
              <table
                style={{
                  width: '100%',
                  minWidth: 420,
                  borderCollapse: 'collapse',
                  fontSize: 13,
                }}
              >
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead style={{ background: KLOEL_THEME.bgSecondary }}>{children}</thead>
          ),
          th: ({ children }) => (
            <th
              style={{
                textAlign: 'left',
                padding: '10px 12px',
                borderBottom: `1px solid ${BORDER}`,
                color: MUTED,
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontFamily: MONO,
              }}
            >
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td
              style={{
                padding: '10px 12px',
                borderBottom: `1px solid ${BORDER}`,
                verticalAlign: 'top',
              }}
            >
              {children}
            </td>
          ),
        }}
      >
        {sanitizedContent}
      </ReactMarkdown>
    </div>
  );
}
