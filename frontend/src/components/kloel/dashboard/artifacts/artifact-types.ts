'use client';

import type { AssistantReasoningFile } from '@/lib/kloel-message-ui';

/**
 * Artifact model for the Kloel chat ARTIFACTS panel.
 *
 * An artifact is a rich, assistant-produced deliverable (a document, page,
 * diagram, code file, etc.) that the user can open in a side/overlay window,
 * read rendered, edit when it is a text kind, and download. Artifacts are
 * derived ONLY from real assistant outputs — the real `file` stream events that
 * land in message metadata (`AssistantReasoningFile`) and the substantial
 * fenced blocks already detected by `detectDeliverableAnswerFiles`. Nothing
 * here fabricates an artifact: if a file carries no recoverable text and no
 * remote URL, it does not become an editable artifact (it stays a download).
 */

/** The rich artifact kinds the panel can render. */
export type ArtifactKind =
  | 'markdown'
  | 'html'
  | 'svg'
  | 'mermaid'
  | 'react'
  | 'pdf'
  | 'docx'
  | 'pptx'
  | 'xlsx'
  | 'image'
  | 'data'
  | 'code';

/** A single rich artifact opened in the side panel. */
export interface Artifact {
  /** Stable id (derived from the source file name + conversation). */
  readonly id: string;
  /** Conversation this artifact belongs to (empty for an unsaved draft thread). */
  readonly conversationId: string;
  /** Render/edit strategy for this artifact. */
  readonly kind: ArtifactKind;
  /** Human title shown in the window header (the file name). */
  readonly title: string;
  /**
   * The recovered text content for text kinds (markdown/html/svg/mermaid/react/
   * code). Empty when the artifact is a remote/binary deliverable (e.g. a pdf
   * fetched over `downloadUrl`) whose bytes are not inlined.
   */
  readonly content: string;
  /** Real download target (data: URL for inlined text, remote URL otherwise). */
  readonly downloadUrl?: string | undefined;
  /** Server-side content reference, when the stream/event stores bytes elsewhere. */
  readonly contentRef?: string | undefined;
  /** Optional secondary label from the source file ("Documento · MD"). */
  readonly meta?: string | undefined;
  /** Text kinds with recoverable inline content are editable in place. */
  readonly editable: boolean;
  /** Whether the producing event marked this artifact as durable. */
  readonly persistent?: boolean | undefined;
  /** Wall-clock creation time (ms epoch) for ordering. */
  readonly createdAt: number;
}

/** Lowercased extension → artifact kind. Unknown text extensions fall back to code. */
const EXTENSION_TO_KIND: Readonly<Record<string, ArtifactKind>> = {
  md: 'markdown',
  markdown: 'markdown',
  html: 'html',
  htm: 'html',
  svg: 'svg',
  mmd: 'mermaid',
  mermaid: 'mermaid',
  tsx: 'react',
  jsx: 'react',
  pdf: 'pdf',
  doc: 'docx',
  docx: 'docx',
  ppt: 'pptx',
  pptx: 'pptx',
  xls: 'xlsx',
  xlsx: 'xlsx',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  avif: 'image',
  ts: 'code',
  js: 'code',
  mjs: 'code',
  cjs: 'code',
  py: 'code',
  rb: 'code',
  go: 'code',
  rs: 'code',
  java: 'code',
  c: 'code',
  cpp: 'code',
  cs: 'code',
  php: 'code',
  sh: 'code',
  bash: 'code',
  sql: 'code',
  json: 'data',
  yaml: 'code',
  yml: 'code',
  toml: 'code',
  css: 'code',
  csv: 'data',
  tsv: 'data',
  txt: 'code',
};

/** Text kinds whose inline content can be edited in the panel. */
const EDITABLE_KINDS: ReadonlySet<ArtifactKind> = new Set<ArtifactKind>([
  'markdown',
  'html',
  'svg',
  'mermaid',
  'react',
  'data',
  'code',
]);

/** Extract the lowercased extension from a file name (no leading dot). */
export function extractFileExtension(fileName: string): string {
  const trimmed = String(fileName || '').trim();
  const dot = trimmed.lastIndexOf('.');
  if (dot < 0 || dot === trimmed.length - 1) {
    return '';
  }
  return trimmed.slice(dot + 1).toLowerCase();
}

/** Map a file name to its artifact kind (defaults to `code` for text-like names). */
export function artifactKindFromFileName(fileName: string): ArtifactKind {
  const ext = extractFileExtension(fileName);
  return EXTENSION_TO_KIND[ext] ?? 'code';
}

/**
 * Decode the inline text content of a `data:` URL. Returns null for non-data
 * URLs, non-text payloads (e.g. pdf), or malformed encodings — callers then
 * treat the file as a remote/binary download rather than an editable artifact.
 */
export function decodeDataUrlText(downloadUrl: string | undefined): string | null {
  const url = String(downloadUrl || '');
  if (!url.startsWith('data:')) {
    return null;
  }
  const comma = url.indexOf(',');
  if (comma < 0) {
    return null;
  }
  const header = url.slice(5, comma).toLowerCase();
  const payload = url.slice(comma + 1);
  const isBase64 = header.includes(';base64');
  try {
    if (isBase64) {
      const binary = atob(payload);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new TextDecoder().decode(bytes);
    }
    return decodeURIComponent(payload);
  } catch {
    return null;
  }
}

/** Encode UTF-8 text into a base64 `data:` URL for a download target. */
export function encodeTextToDataUrl(text: string, mime: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return `data:${mime};charset=utf-8;base64,${btoa(binary)}`;
}

/** The text MIME type used to re-encode an edited artifact for download, by kind. */
export function downloadMimeForKind(kind: ArtifactKind): string {
  switch (kind) {
    case 'markdown':
      return 'text/markdown';
    case 'html':
      return 'text/html';
    case 'svg':
      return 'image/svg+xml';
    case 'pdf':
      return 'application/pdf';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'pptx':
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'image':
      return 'application/octet-stream';
    case 'data':
      return 'text/csv';
    case 'mermaid':
    case 'react':
    case 'code':
    default:
      return 'text/plain';
  }
}

/**
 * Build an Artifact from a real assistant file (a `file` stream event or an
 * answer-derived fenced block). Returns null when the file has neither
 * recoverable inline text nor a remote URL — there is then no real artifact to
 * open, only a plain download already handled elsewhere.
 */
export function artifactFromReasoningFile(
  file: AssistantReasoningFile,
  conversationId: string,
  index: number,
  createdAt: number,
): Artifact | null {
  const title = String(file.name || '').trim();
  if (!title) {
    return null;
  }
  const kind = file.kind || artifactKindFromFileName(title);
  const inlineText =
    typeof file.content === 'string' ? file.content : decodeDataUrlText(file.downloadUrl);
  const hasInlineText = inlineText !== null && inlineText.trim().length > 0;
  const downloadUrl =
    file.downloadUrl ||
    file.url ||
    (hasInlineText ? encodeTextToDataUrl(inlineText as string, downloadMimeForKind(kind)) : undefined);
  const editable = hasInlineText && (file.editable ?? EDITABLE_KINDS.has(kind));

  // No inline text, no remote target, and no server ref means nothing real can open.
  if (!hasInlineText && !downloadUrl && !file.contentRef) {
    return null;
  }

  const artifactKey =
    typeof file.artifactId === 'string' && file.artifactId.trim()
      ? file.artifactId.trim()
      : `${index}:${title}`;

  return {
    id: `${conversationId || 'draft'}:${artifactKey}`,
    conversationId,
    kind,
    title,
    content: hasInlineText ? (inlineText as string) : '',
    downloadUrl,
    contentRef: file.contentRef,
    meta: file.meta,
    editable,
    persistent: file.persistent,
    createdAt,
  };
}
