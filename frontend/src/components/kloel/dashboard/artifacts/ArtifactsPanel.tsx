'use client';

import { useMemo, useState } from 'react';
import { Code2, Download, FileText, Pencil, Check } from 'lucide-react';

import { kloelT } from '@/lib/i18n/t';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { KloelMarkdown } from '@/components/kloel/KloelMarkdown';
import {
  CHAT_INLINE_PADDING,
  DIVIDER,
  E,
  F,
  MUTED,
  SURFACE,
  TEXT,
} from '../KloelDashboard.subcomponents';
import { ArtifactWindowChrome } from './ArtifactWindowChrome';
import {
  downloadMimeForKind,
  encodeTextToDataUrl,
  type Artifact,
  type ArtifactKind,
} from './artifact-types';

/**
 * The ARTIFACTS panel — opens an assistant-produced rich artifact in the Kloel
 * macOS-style floating window (`ArtifactWindowChrome`). It renders the real
 * lightweight version of each kind, exposes a Download action, and allows basic
 * in-place editing for text kinds. Nothing is fabricated: the content and the
 * download target come from the real source file the artifact was derived from.
 *
 * Per-kind rendering (all real, all lightweight):
 *  - markdown → `KloelMarkdown` (the same renderer the chat answer uses).
 *  - html → rendered in an origin-isolated `sandbox` iframe with scripts/forms
 *    allowed inside the artifact, never in the Kloel app context.
 *  - react → rendered in an origin-isolated artifact iframe with the approved
 *    CDN library set injected for interactive UI previews.
 *  - data → rendered as a compact table preview.
 *  - svg / mermaid / code → fed to `KloelMarkdown` as a fenced block of the
 *    matching language; `KloelMarkdown` preserves existing diagram/code support.
 *  - pdf → embedded via the real download URL when present; otherwise a
 *    download-only card (binary bytes are not inlined as editable text).
 */

const LANGUAGE_FENCE_BY_KIND: Readonly<Record<ArtifactKind, string>> = {
  markdown: '',
  html: 'html',
  svg: 'svg',
  mermaid: 'mermaid',
  react: 'tsx',
  code: '',
  data: '',
  pdf: '',
  docx: '',
  pptx: '',
  xlsx: '',
  image: '',
};

const KIND_LABEL: Readonly<Record<ArtifactKind, string>> = {
  markdown: 'Documento',
  html: 'Página HTML',
  svg: 'Imagem SVG',
  mermaid: 'Diagrama',
  react: 'Componente React',
  code: 'Código',
  data: 'Dados',
  pdf: 'PDF',
  docx: 'Documento Word',
  pptx: 'Apresentação',
  xlsx: 'Planilha',
  image: 'Imagem',
};

/** Wrap raw artifact content into the markdown string `KloelMarkdown` renders. */
function toMarkdownSource(artifact: Artifact): string {
  if (artifact.kind === 'markdown') {
    return artifact.content;
  }
  const fence = LANGUAGE_FENCE_BY_KIND[artifact.kind];
  return ['```' + fence, artifact.content, '```'].join('\n');
}

function iframePreviewStyle() {
  return {
    width: '100%',
    height: '100%',
    minHeight: 320,
    border: 'none',
    background: 'rgb(255,255,255)',
    flex: 1,
  } as const;
}

function HtmlArtifactView({ html }: { readonly html: string }) {
  return (
    <iframe
      title={kloelT(`Pré-visualização HTML`)}
      sandbox="allow-scripts allow-forms allow-popups allow-modals"
      srcDoc={html}
      style={iframePreviewStyle()}
    />
  );
}

function normalizeReactArtifactSource(source: string): string {
  return String(source || '')
    .replace(/export\s+default\s+function\s+App\s*\(/, 'function App(')
    .replace(/export\s+default\s+App\s*;?/, '')
    .replace(/export\s+default\s+/, 'const App = ')
    .trim();
}

function buildReactArtifactSrcDoc(source: string): string {
  const normalizedSource = normalizeReactArtifactSource(source);
  const sourceLiteral = JSON.stringify(normalizedSource);
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script src="https://unpkg.com/recharts/umd/Recharts.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js"></script>
  <script src="https://unpkg.com/three@0.164.1/build/three.min.js"></script>
  <script src="https://cdn.plot.ly/plotly-2.32.0.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js"></script>
  <script src="https://unpkg.com/tone@14.8.49/build/Tone.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/mathjs@12.4.2/lib/browser/math.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/mammoth@1.7.2/mammoth.browser.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.20.0/dist/tf.min.js"></script>
  <script src="https://unpkg.com/lucide-react@0.468.0/dist/umd/lucide-react.js"></script>
  <style>html,body,#root{margin:0;min-height:100%;font-family:Inter,system-ui,sans-serif}body{background:#fff;color:#151515;padding:18px;box-sizing:border-box}</style>
</head>
<body>
  <div id="root"></div>
  <script>
    const { LineChart, Line, BarChart, Bar, XAxis, YAxis } = Recharts;
    const LucideReact = window.LucideReact || {};
    const { Search, Download, Save, X, Maximize2, MapPin } = LucideReact;
    const artifactSource = ${sourceLiteral};
    const compiled = Babel.transform(artifactSource, { presets: ['react'] }).code;
    const module = { exports: {} };
    const exports = module.exports;
    const App = new Function('React','ReactDOM','Recharts','d3','THREE','Plotly','Chart','Tone','math','_','Papa','XLSX','mammoth','tf','LucideReact','module','exports', compiled + '; return typeof App !== "undefined" ? App : module.exports.default;')(React, ReactDOM, Recharts, d3, THREE, Plotly, Chart, Tone, math, _, Papa, XLSX, mammoth, tf, LucideReact, module, exports);
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
  </script>
</body>
</html>`;
}

function ReactArtifactView({ source }: { readonly source: string }) {
  return (
    <iframe
      title={kloelT(`Pré-visualização React`)}
      sandbox="allow-scripts allow-forms allow-popups allow-modals"
      srcDoc={buildReactArtifactSrcDoc(source)}
      style={iframePreviewStyle()}
    />
  );
}

function splitDelimitedLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === ',' && !quoted) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function DataArtifactView({ source }: { readonly source: string }) {
  const rows = String(source || '')
    .trim()
    .split(/\r?\n/)
    .map(splitDelimitedLine)
    .filter((row) => row.some((cell) => cell.length > 0));
  if (rows.length === 0) {
    return <div style={{ padding: CHAT_INLINE_PADDING, color: MUTED, fontSize: 14, fontFamily: F }}>{kloelT(`Sem dados para visualizar.`)}</div>;
  }
  const [header = [], ...body] = rows;
  return (
    <div style={{ padding: CHAT_INLINE_PADDING, overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: F, fontSize: 13.5 }}>
        <thead>
          <tr>
            {header.map((cell, index) => (
              <th key={`${cell}-${index}`} style={{ textAlign: 'left', padding: '9px 10px', borderBottom: `1px solid ${DIVIDER}`, color: TEXT, background: KLOEL_THEME.bgSecondary }}>
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {header.map((_, cellIndex) => (
                <td key={cellIndex} style={{ padding: '9px 10px', borderBottom: `1px solid ${DIVIDER}`, color: TEXT }}>
                  {row[cellIndex] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PdfArtifactView({ artifact }: { readonly artifact: Artifact }) {
  if (artifact.downloadUrl) {
    return (
      <iframe
        title={artifact.title}
        src={artifact.downloadUrl}
        style={{ width: '100%', height: '100%', minHeight: 320, border: 'none', flex: 1 }}
      />
    );
  }
  return (
    <div style={{ padding: CHAT_INLINE_PADDING, color: MUTED, fontSize: 14, fontFamily: F }}>
      {kloelT(`Este PDF está disponível apenas para download.`)}
    </div>
  );
}

/** The artifacts side/overlay panel. Renders `null` when no artifact is open. */
export function ArtifactsPanel({
  artifact,
  editable,
  onClose,
  onContentChange,
}: {
  readonly artifact: Artifact | null;
  /** True when this kind supports in-place editing (text kinds with content). */
  readonly editable: boolean;
  readonly onClose: () => void;
  readonly onContentChange: (artifactId: string, nextContent: string) => void;
}) {
  const activeArtifactId = artifact?.id ?? null;
  const [editState, setEditState] = useState<{
    artifactId: string | null;
    isEditing: boolean;
  }>({ artifactId: null, isEditing: false });
  const isEditing = editState.artifactId === activeArtifactId ? editState.isEditing : false;

  const downloadHref = useMemo(() => {
    if (!artifact) {
      return '';
    }
    // For editable text kinds always re-encode the current content so the
    // download reflects in-session edits; otherwise use the real source URL.
    if (artifact.editable && artifact.content) {
      return encodeTextToDataUrl(artifact.content, downloadMimeForKind(artifact.kind));
    }
    return artifact.downloadUrl || '';
  }, [artifact]);

  if (!artifact) {
    return null;
  }

  const kindLabel = KIND_LABEL[artifact.kind];
  const canEdit = editable && artifact.editable;
  const Icon = artifact.kind === 'code' || artifact.kind === 'react' ? Code2 : FileText;

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
      <Icon size={15} strokeWidth={1.9} aria-hidden="true" color={MUTED} />
      <span
        style={{
          fontSize: 13.5,
          fontWeight: 600,
          color: TEXT,
          fontFamily: F,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {artifact.title}
      </span>
      <span style={{ fontSize: 12, color: MUTED, fontFamily: F, flexShrink: 0 }}>
        · {kindLabel}
      </span>
      <span style={{ flex: 1 }} />
      {canEdit ? (
        <button
          type="button"
          data-window-control
          aria-label={isEditing ? kloelT(`Concluir edição`) : kloelT(`Editar`)}
          title={isEditing ? kloelT(`Concluir edição`) : kloelT(`Editar`)}
          onClick={() =>
            setEditState((value) => ({
              artifactId: artifact.id,
              isEditing: value.artifactId === artifact.id ? !value.isEditing : true,
            }))
          }
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            border: `1px solid ${DIVIDER}`,
            borderRadius: 8,
            background: isEditing ? `color-mix(in srgb, ${E} 12%, ${SURFACE})` : 'transparent',
            color: isEditing ? E : MUTED,
            fontFamily: F,
            fontSize: 12,
            fontWeight: 600,
            padding: '5px 9px',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          {isEditing ? (
            <Check size={13} strokeWidth={2} aria-hidden="true" />
          ) : (
            <Pencil size={13} strokeWidth={1.9} aria-hidden="true" />
          )}
          {isEditing ? kloelT(`Concluir`) : kloelT(`Editar`)}
        </button>
      ) : null}
      {downloadHref ? (
        <a
          href={downloadHref}
          download={artifact.title}
          target="_blank"
          rel="noreferrer"
          data-window-control
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            border: `1px solid color-mix(in srgb, ${E} 22%, ${DIVIDER})`,
            background: `color-mix(in srgb, ${E} 10%, ${SURFACE})`,
            color: E,
            borderRadius: 8,
            padding: '5px 10px',
            fontFamily: F,
            fontSize: 12,
            fontWeight: 700,
            textDecoration: 'none',
            flexShrink: 0,
          }}
        >
          <Download size={13} strokeWidth={1.9} aria-hidden="true" />
          {kloelT(`Baixar`)}
        </a>
      ) : null}
    </div>
  );

  return (
    <ArtifactWindowChrome
      ariaLabel={`${kloelT(`Artefato`)}: ${artifact.title}`}
      header={header}
      onClose={onClose}
    >
      {isEditing && canEdit ? (
        <textarea
          aria-label={kloelT(`Editar conteúdo do artefato`)}
          value={artifact.content}
          onChange={(event) => onContentChange(artifact.id, event.target.value)}
          spellCheck={false}
          style={{
            flex: 1,
            width: '100%',
            minHeight: 280,
            resize: 'none',
            border: 'none',
            outline: 'none',
            background: KLOEL_THEME.bgPrimary,
            color: TEXT,
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 13,
            lineHeight: 1.6,
            padding: CHAT_INLINE_PADDING,
            boxSizing: 'border-box',
          }}
        />
            ) : artifact.kind === 'html' ? (
        <HtmlArtifactView html={artifact.content} />
      ) : artifact.kind === 'react' ? (
        <ReactArtifactView source={artifact.content} />
      ) : artifact.kind === 'pdf' ? (
        <PdfArtifactView artifact={artifact} />
      ) : artifact.kind === 'data' ? (
        <DataArtifactView source={artifact.content} />
      ) : (
        <div
          style={{
            padding: CHAT_INLINE_PADDING,
            fontSize: 15,
            lineHeight: 1.78,
            color: TEXT,
            fontFamily: F,
          }}
        >
          <KloelMarkdown content={toMarkdownSource(artifact)} />
        </div>
      )}
    </ArtifactWindowChrome>
  );
}
