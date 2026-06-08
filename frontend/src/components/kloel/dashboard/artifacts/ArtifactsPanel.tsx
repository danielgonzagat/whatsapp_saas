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
 *  - svg / mermaid / code / react → fed to `KloelMarkdown` as a fenced block of
 *    the matching language; `KloelMarkdown` already renders sanitized SVG, a
 *    lightweight mermaid SVG, and syntax-styled code blocks.
 *  - html → rendered in a `sandbox` iframe (scripts disabled) so the page shows
 *    faithfully without executing untrusted JS.
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
  pdf: '',
};

const KIND_LABEL: Readonly<Record<ArtifactKind, string>> = {
  markdown: 'Documento',
  html: 'Página HTML',
  svg: 'Imagem SVG',
  mermaid: 'Diagrama',
  react: 'Componente React',
  code: 'Código',
  pdf: 'PDF',
};

/** Wrap raw artifact content into the markdown string `KloelMarkdown` renders. */
function toMarkdownSource(artifact: Artifact): string {
  if (artifact.kind === 'markdown') {
    return artifact.content;
  }
  const fence = LANGUAGE_FENCE_BY_KIND[artifact.kind];
  return ['```' + fence, artifact.content, '```'].join('\n');
}

function HtmlArtifactView({ html }: { readonly html: string }) {
  return (
    <iframe
      title={kloelT(`Pré-visualização HTML`)}
      // Scripts are disabled (sandbox without allow-scripts) so untrusted page
      // JavaScript cannot execute — only the real HTML/CSS renders.
      sandbox=""
      srcDoc={html}
      style={{
        width: '100%',
        height: '100%',
        minHeight: 320,
        border: 'none',
        background: 'rgb(255,255,255)',
        flex: 1,
      }}
    />
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
      ) : artifact.kind === 'pdf' ? (
        <PdfArtifactView artifact={artifact} />
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
