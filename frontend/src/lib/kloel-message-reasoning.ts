'use client';

import type { KloelStreamEvent } from './kloel-stream-events';
import { normalizeAssistantMessageMetadata } from './kloel-message-metadata';

export interface AssistantReasoningFile {
  /** Name property. */
  name: string;
  /** Meta property. */
  meta?: string | undefined;
  /** Url property. */
  url?: string | undefined;
  /** Download url property. */
  downloadUrl?: string | undefined;
}

/** Public-safe reasoning UI shape. Raw provider reasoning is never exposed. */
export interface AssistantReasoning {
  /**
   * Live streamed reasoning text accumulated from reasoning_delta events. This
   * is the real model reasoning surfaced token-by-token in the thinking step.
   * The legacy private `reasoningText` metadata field is never read here.
   */
  text: string;
  /** Summary property. */
  summary: string;
  /** Duration ms property. */
  durationMs: number | null;
  /** Files property. */
  files: AssistantReasoningFile[];
}

/** Get public-safe reasoning metadata for an assistant message. */
export function getAssistantReasoning(metadata: unknown): AssistantReasoning {
  const normalized = normalizeAssistantMessageMetadata(metadata);
  const text =
    typeof normalized?.streamedReasoning === 'string' ? normalized.streamedReasoning : '';
  const summary =
    typeof normalized?.reasoningSummary === 'string' ? normalized.reasoningSummary : '';
  const durationMs =
    typeof normalized?.reasoningDurationMs === 'number' ? normalized.reasoningDurationMs : null;
  const rawFiles = Array.isArray(normalized?.files) ? normalized.files : [];
  const files = rawFiles
    .map((entry): AssistantReasoningFile | null => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return null;
      }
      const candidate = entry as Record<string, unknown>;
      if (typeof candidate.name !== 'string' || !candidate.name.trim()) {
        return null;
      }
      return {
        name: candidate.name,
        meta: typeof candidate.meta === 'string' ? candidate.meta : undefined,
        url: typeof candidate.url === 'string' ? candidate.url : undefined,
        downloadUrl: typeof candidate.downloadUrl === 'string' ? candidate.downloadUrl : undefined,
      };
    })
    .filter((entry): entry is AssistantReasoningFile => !!entry);
  return { text, summary, durationMs, files };
}

/** Apply public-safe reasoning/file stream events into assistant message metadata. */
export function applyReasoningStreamEventToMetadata(
  metadata: Record<string, unknown>,
  event: KloelStreamEvent,
): Record<string, unknown> | null {
  if (event.type === 'reasoning_delta') {
    // Accumulate the real streamed reasoning text token-by-token so the live
    // thinking timeline renders it. Stored under a dedicated key (never the
    // legacy `reasoningText` field, which is kept private) and the first delta
    // stamps the wall-clock start used to derive the real duration.
    const previous =
      typeof metadata.streamedReasoning === 'string' ? metadata.streamedReasoning : '';
    const startedAt =
      typeof metadata.reasoningStartedAt === 'number' ? metadata.reasoningStartedAt : Date.now();
    return { ...metadata, streamedReasoning: previous + event.text, reasoningStartedAt: startedAt };
  }
  if (event.type === 'reasoning_summary') {
    return { ...metadata, reasoningSummary: event.text };
  }
  if (event.type === 'reasoning_done') {
    // Prefer the provider-supplied durationMs; if it is non-positive, derive the
    // real elapsed time from the stamped start of the first streamed delta.
    const startedAt =
      typeof metadata.reasoningStartedAt === 'number' ? metadata.reasoningStartedAt : null;
    const derivedMs = startedAt !== null ? Math.max(0, Date.now() - startedAt) : 0;
    const durationMs = event.durationMs > 0 ? event.durationMs : derivedMs;
    return { ...metadata, reasoningDurationMs: durationMs };
  }
  if (event.type === 'file') {
    const currentFiles = Array.isArray(metadata.files) ? metadata.files : [];
    const nextFile: AssistantReasoningFile = {
      name: event.name,
      meta: event.meta,
      url: event.url,
      downloadUrl: event.downloadUrl,
    };
    return { ...metadata, files: [...currentFiles, nextFile] };
  }
  return null;
}
const ANSWER_FENCED_BLOCK_G_RE = /```([a-zA-Z0-9_+-]*)[^\S\r\n]*\r?\n([\s\S]*?)```/g;
const ANSWER_DIACRITICS_G_RE = /[̀-ͯ]/g;
const ANSWER_NON_SLUG_G_RE = /[^a-zA-Z0-9]+/g;
const ANSWER_EDGE_DASH_G_RE = /^-+|-+$/g;
const ANSWER_FILE_HEADING_RE = /^\s*#{1,3}\s+(.+)$/m;
const ANSWER_TRAILING_WS_G_RE = /\s+$/;

const ANSWER_FILE_KIND_BY_LANG: Record<string, { ext: string; mime: string; label: string }> = {
  markdown: { ext: 'md', mime: 'text/markdown', label: 'Documento' },
  md: { ext: 'md', mime: 'text/markdown', label: 'Documento' },
  html: { ext: 'html', mime: 'text/html', label: 'Página HTML' },
  svg: { ext: 'svg', mime: 'image/svg+xml', label: 'Imagem SVG' },
  csv: { ext: 'csv', mime: 'text/csv', label: 'Planilha CSV' },
  json: { ext: 'json', mime: 'application/json', label: 'Dados JSON' },
  mermaid: { ext: 'mmd', mime: 'text/plain', label: 'Diagrama' },
  yaml: { ext: 'yaml', mime: 'text/plain', label: 'Configuração' },
  yml: { ext: 'yml', mime: 'text/plain', label: 'Configuração' },
  sql: { ext: 'sql', mime: 'text/plain', label: 'Script SQL' },
  python: { ext: 'py', mime: 'text/x-python', label: 'Código Python' },
  py: { ext: 'py', mime: 'text/x-python', label: 'Código Python' },
  javascript: { ext: 'js', mime: 'text/javascript', label: 'Código JavaScript' },
  js: { ext: 'js', mime: 'text/javascript', label: 'Código JavaScript' },
  typescript: { ext: 'ts', mime: 'text/plain', label: 'Código TypeScript' },
  ts: { ext: 'ts', mime: 'text/plain', label: 'Código TypeScript' },
  tsx: { ext: 'tsx', mime: 'text/plain', label: 'Componente React' },
  jsx: { ext: 'jsx', mime: 'text/javascript', label: 'Componente React' },
  bash: { ext: 'sh', mime: 'text/x-sh', label: 'Script Shell' },
  sh: { ext: 'sh', mime: 'text/x-sh', label: 'Script Shell' },
};
const DEFAULT_ANSWER_FILE_KIND = { ext: 'txt', mime: 'text/plain', label: 'Documento' };
const MIN_ANSWER_FILE_CHARS = 280;
const MAX_ANSWER_FILES = 3;

function slugifyAnswerFileBase(value: string): string {
  const slug = value
    .normalize('NFD')
    .replace(ANSWER_DIACRITICS_G_RE, '')
    .replace(ANSWER_NON_SLUG_G_RE, '-')
    .replace(ANSWER_EDGE_DASH_G_RE, '')
    .toLowerCase()
    .slice(0, 48);
  return slug || 'documento';
}

function toUtf8Base64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary);
}

/**
 * Derive downloadable file cards from substantial fenced document/code blocks in
 * the completed answer text. Works across every answer path (direct + tool) and
 * survives reload, because it reads the rendered answer the client already has.
 * Honest: only real blocks (>= MIN_ANSWER_FILE_CHARS) become cards.
 */
export function detectDeliverableAnswerFiles(answer: string): AssistantReasoningFile[] {
  const source = String(answer || '');
  const files: AssistantReasoningFile[] = [];
  const seen = new Set<string>();
  ANSWER_FENCED_BLOCK_G_RE.lastIndex = 0;
  let match = ANSWER_FENCED_BLOCK_G_RE.exec(source);
  while (match && files.length < MAX_ANSWER_FILES) {
    const lang = String(match[1] || '').toLowerCase();
    const content = String(match[2] || '').replace(ANSWER_TRAILING_WS_G_RE, '');
    match = ANSWER_FENCED_BLOCK_G_RE.exec(source);
    if (content.trim().length < MIN_ANSWER_FILE_CHARS) {
      continue;
    }
    const dedupeKey = content.slice(0, 160);
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    const kind = ANSWER_FILE_KIND_BY_LANG[lang] || DEFAULT_ANSWER_FILE_KIND;
    const headingMatch = content.match(ANSWER_FILE_HEADING_RE);
    const base = headingMatch
      ? slugifyAnswerFileBase(headingMatch[1] || '')
      : `documento-${files.length + 1}`;
    files.push({
      name: `${base}.${kind.ext}`,
      meta: `${kind.label} · ${kind.ext.toUpperCase()}`,
      downloadUrl: `data:${kind.mime};charset=utf-8;base64,${toUtf8Base64(content)}`,
    });
  }
  // Trailing unclosed fence: a document whose closing ``` never arrived (the
  // answer was cut off / is the only block) still gets a card so truncated
  // documents remain downloadable.
  if (files.length < MAX_ANSWER_FILES) {
    const fenceCount = (source.match(/```/g) || []).length;
    const lastFence = source.lastIndexOf('```');
    if (fenceCount % 2 === 1 && lastFence >= 0) {
      const tail = source.slice(lastFence + 3);
      const nlIndex = tail.indexOf('\n');
      if (nlIndex >= 0) {
        const lang = tail.slice(0, nlIndex).trim().toLowerCase();
        const content = tail.slice(nlIndex + 1).replace(ANSWER_TRAILING_WS_G_RE, '');
        const dedupeKey = content.slice(0, 160);
        if (content.trim().length >= MIN_ANSWER_FILE_CHARS && !seen.has(dedupeKey)) {
          const kind = ANSWER_FILE_KIND_BY_LANG[lang] || DEFAULT_ANSWER_FILE_KIND;
          const headingMatch = content.match(ANSWER_FILE_HEADING_RE);
          const base = headingMatch
            ? slugifyAnswerFileBase(headingMatch[1] || '')
            : `documento-${files.length + 1}`;
          files.push({
            name: `${base}.${kind.ext}`,
            meta: `${kind.label} · ${kind.ext.toUpperCase()}`,
            downloadUrl: `data:${kind.mime};charset=utf-8;base64,${toUtf8Base64(content)}`,
          });
        }
      }
    }
  }
  return files;
}

/** Merge answer-derived file cards into a reasoning object, deduped by name. */
export function withDeliverableFiles(
  reasoning: AssistantReasoning,
  answer: string,
): AssistantReasoning {
  const derived = detectDeliverableAnswerFiles(answer);
  if (derived.length === 0) {
    return reasoning;
  }
  const existingNames = new Set(reasoning.files.map((file) => file.name));
  const extra = derived.filter((file) => !existingNames.has(file.name));
  if (extra.length === 0) {
    return reasoning;
  }
  return { ...reasoning, files: [...reasoning.files, ...extra] };
}
