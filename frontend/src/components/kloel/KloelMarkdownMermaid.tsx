'use client';

import { KLOEL_THEME } from '@/lib/kloel-theme';
import { loadMermaid, renderMermaidWithApi } from './KloelMarkdownCdn';
import DOMPurify from 'dompurify';
import { useEffect, useMemo, useState } from 'react';
import { useClientMounted } from './KloelMarkdownClient';

const BORDER = KLOEL_THEME.borderPrimary;
const MONO = "'JetBrains Mono', monospace";

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

/** Stable, DOM-safe id for a mermaid render call (mermaid mutates by id). */
let mermaidRenderSeq = 0;
function nextMermaidId(): string {
  mermaidRenderSeq += 1;
  return `kloel-mermaid-${mermaidRenderSeq}`;
}

/** Sanitize a mermaid SVG string defensively (its own securityLevel is strict). */
function sanitizeMermaidSvg(raw: string): string {
  return DOMPurify.sanitize(raw, { USE_PROFILES: { svg: true, svgFilters: true } });
}

/**
 * Built-in fallback: render the directed-graph subset locally, or signal an
 * unsupported diagram type so the caller shows the labelled source block.
 */
function buildFallbackMermaid(source: string): { svg: string | null; unsupported: boolean } {
  const graph = parseMermaid(source);
  if (!graph) {
    return { svg: null, unsupported: true };
  }
  return { svg: sanitizeMermaidSvg(renderMermaidSvg(graph)), unsupported: false };
}

/** A real-mermaid SVG keyed by the exact source it was produced from. */
interface MermaidCdnResult {
  source: string;
  svg: string;
}

/** Render a ```mermaid block as a real client-side SVG diagram (lazy / no SSR). */
export function MermaidArtifact({ source }: { source: string }) {
  // Defer parse/render until after the first client paint (lazy), keeping SSR a no-op.
  const mounted = useClientMounted();

  // Immediate, SSR-safe built-in render (real geometry for graph/flowchart).
  const fallback = useMemo(() => {
    if (!mounted) {
      return { svg: null, unsupported: false };
    }
    return buildFallbackMermaid(source);
  }, [mounted, source]);

  const [cdnResult, setCdnResult] = useState<MermaidCdnResult | null>(null);

  useEffect(() => {
    if (!mounted) {
      return;
    }
    let cancelled = false;
    void loadMermaid().then(async (mermaid) => {
      if (cancelled || !mermaid) {
        // CDN unreachable → keep the built-in fallback already shown.
        return;
      }
      const rendered = await renderMermaidWithApi(mermaid, nextMermaidId(), source);
      if (cancelled || rendered === null) {
        // Real mermaid couldn't parse this source; keep the built-in fallback.
        return;
      }
      // mermaid runs with securityLevel:'strict'; sanitize once more defensively.
      setCdnResult({ source, svg: sanitizeMermaidSvg(rendered) });
    });
    return () => {
      cancelled = true;
    };
  }, [mounted, source]);

  // Prefer the real-mermaid SVG only when it matches the current source.
  const mermaidLoaded = cdnResult !== null && cdnResult.source === source;
  const { svg, unsupported } = mermaidLoaded
    ? { svg: cdnResult.svg, unsupported: false }
    : fallback;

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
      data-mermaid={mermaidLoaded ? 'cdn' : 'builtin'}
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
