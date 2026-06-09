// before opening any writer stream through this module.
import { Response } from 'express';
import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import {
  type KloelFileArtifactKind,
  type KloelStreamEvent,
  createKloelAssistantVisibleTextStreamFilter,
  createKloelContentEvent,
  createKloelStatusEvent,
  createKloelReasoningDeltaEvent,
  createKloelReasoningDoneEvent,
  createKloelDoneEvent,
  createKloelFileEvent,
} from './kloel-stream-events';
import { chatCompletionStreamWithRetry } from './openai-wrapper';
import { KloelLLME2EGuard } from './kloel-llm-e2e-guard';
import { sanitizeAssistantReasoningTextForStorage } from './kloel-thread.helpers';

const U2028_U2029_RE = /[<>&\u2028\u2029]/g;
type ChatCompletionStream = AsyncIterable<OpenAI.ChatCompletionChunk>;

const FENCED_BLOCK_G_RE = /```([a-zA-Z0-9_+-]*)[^\S\r\n]*\r?\n([\s\S]*?)```/g;
const TRAILING_WS_G_RE = /\s+$/;
const DIACRITICS_G_RE = /[̀-ͯ]/g;
const NON_SLUG_G_RE = /[^a-zA-Z0-9]+/g;
const EDGE_DASH_G_RE = /^-+|-+$/g;
const FILE_HEADING_RE = /^\s*#{1,3}\s+(.+)$/m;

interface DeliverableFileKind {
  ext: string;
  mime: string;
  label: string;
  artifactKind?: KloelFileArtifactKind;
  binary?: boolean;
}

const FILE_KIND_BY_LANG: Record<string, DeliverableFileKind> = {
  markdown: { ext: 'md', mime: 'text/markdown', label: 'Documento', artifactKind: 'markdown' },
  md: { ext: 'md', mime: 'text/markdown', label: 'Documento', artifactKind: 'markdown' },
  html: { ext: 'html', mime: 'text/html', label: 'Página HTML', artifactKind: 'html' },
  svg: { ext: 'svg', mime: 'image/svg+xml', label: 'Imagem SVG', artifactKind: 'svg' },
  csv: { ext: 'csv', mime: 'text/csv', label: 'Planilha CSV', artifactKind: 'data' },
  json: { ext: 'json', mime: 'application/json', label: 'Dados JSON', artifactKind: 'data' },
  mermaid: { ext: 'mmd', mime: 'text/plain', label: 'Diagrama', artifactKind: 'mermaid' },
  pdf: { ext: 'pdf', mime: 'application/pdf', label: 'PDF', artifactKind: 'pdf', binary: true },
  docx: {
    ext: 'docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    label: 'Word',
    artifactKind: 'docx',
    binary: true,
  },
  pptx: {
    ext: 'pptx',
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    label: 'PowerPoint',
    artifactKind: 'pptx',
    binary: true,
  },
  xlsx: {
    ext: 'xlsx',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    label: 'Excel',
    artifactKind: 'xlsx',
    binary: true,
  },
  yaml: { ext: 'yaml', mime: 'text/plain', label: 'Configuração', artifactKind: 'code' },
  yml: { ext: 'yml', mime: 'text/plain', label: 'Configuração', artifactKind: 'code' },
  sql: { ext: 'sql', mime: 'text/plain', label: 'Script SQL', artifactKind: 'code' },
  python: { ext: 'py', mime: 'text/x-python', label: 'Código Python', artifactKind: 'code' },
  py: { ext: 'py', mime: 'text/x-python', label: 'Código Python', artifactKind: 'code' },
  javascript: {
    ext: 'js',
    mime: 'text/javascript',
    label: 'Código JavaScript',
    artifactKind: 'code',
  },
  js: { ext: 'js', mime: 'text/javascript', label: 'Código JavaScript', artifactKind: 'code' },
  typescript: { ext: 'ts', mime: 'text/plain', label: 'Código TypeScript', artifactKind: 'code' },
  ts: { ext: 'ts', mime: 'text/plain', label: 'Código TypeScript', artifactKind: 'code' },
  tsx: { ext: 'tsx', mime: 'text/plain', label: 'Componente React', artifactKind: 'react' },
  jsx: { ext: 'jsx', mime: 'text/javascript', label: 'Componente React', artifactKind: 'react' },
  bash: { ext: 'sh', mime: 'text/x-sh', label: 'Script Shell', artifactKind: 'code' },
  sh: { ext: 'sh', mime: 'text/x-sh', label: 'Script Shell', artifactKind: 'code' },
};

const DEFAULT_FILE_KIND: DeliverableFileKind = {
  ext: 'txt',
  mime: 'text/plain',
  label: 'Documento',
};
const MIN_DELIVERABLE_CHARS = 280;
const MIN_EXPLICIT_DELIVERABLE_CHARS = 24;
const MAX_DELIVERABLE_CARDS = 3;
const EXPLICIT_FILE_CONTEXT_RE =
  /\b(?:arquivo|file|artifact|artefato|download|baixar|salvar|entregue)\b/i;
const DELIVERABLE_PROMISE_RE =
  /\b(?:aqui estão|pront[oa]s?|baixar|download|links abaixo|arquivos? solicitad[oa]s?)\b/i;
const DELIVERABLE_REFUSAL_RE =
  /\b(?:n[aã]o consigo|n[aã]o posso|n[aã]o tenho como|apenas simular|simulad[oa])\b/i;
const DELIVERABLE_REQUEST_RE =
  /\b(?:crie|criar|cria|gera|gerar|monte|produza|elabore|faca|faz|entregue|salve)\b/i;
const DELIVERABLE_REQUEST_CONTEXT_RE =
  /\b(?:arquivo|file|artifact|artefato|markdown|documento|download|baix[aá]vel|salvar)\b/i;
const EXPLICIT_FILENAME_G_RE =
  /\b([A-Za-z0-9][A-Za-z0-9._-]{0,80}\.(?:md|markdown|html|svg|mmd|pdf|docx|pptx|xlsx|json|csv|tsx|jsx|js|ts|py|sql|yaml|yml|sh))\b/gi;
const FILE_KIND_BY_EXT: Record<string, DeliverableFileKind> = {
  md: FILE_KIND_BY_LANG.markdown!,
  markdown: FILE_KIND_BY_LANG.markdown!,
  html: FILE_KIND_BY_LANG.html!,
  svg: FILE_KIND_BY_LANG.svg!,
  mmd: FILE_KIND_BY_LANG.mermaid!,
  pdf: FILE_KIND_BY_LANG.pdf!,
  docx: FILE_KIND_BY_LANG.docx!,
  pptx: FILE_KIND_BY_LANG.pptx!,
  xlsx: FILE_KIND_BY_LANG.xlsx!,
  json: FILE_KIND_BY_LANG.json!,
  csv: FILE_KIND_BY_LANG.csv!,
  tsx: FILE_KIND_BY_LANG.tsx!,
  jsx: FILE_KIND_BY_LANG.jsx!,
  js: FILE_KIND_BY_LANG.js!,
  ts: FILE_KIND_BY_LANG.ts!,
  py: FILE_KIND_BY_LANG.py!,
  sql: FILE_KIND_BY_LANG.sql!,
  yaml: FILE_KIND_BY_LANG.yaml!,
  yml: FILE_KIND_BY_LANG.yml!,
  sh: FILE_KIND_BY_LANG.sh!,
};
const ARTIFACT_PROTOCOL_MARKER_G_RE = /__artifact\b/gi;
const FILE_KIND_BY_MIME: Record<string, DeliverableFileKind> = {
  'application/json': FILE_KIND_BY_LANG.json!,
  'application/pdf': FILE_KIND_BY_LANG.pdf!,
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    FILE_KIND_BY_LANG.pptx!,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': FILE_KIND_BY_LANG.xlsx!,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    FILE_KIND_BY_LANG.docx!,
  'image/svg+xml': FILE_KIND_BY_LANG.svg!,
  'text/csv': FILE_KIND_BY_LANG.csv!,
  'text/html': FILE_KIND_BY_LANG.html!,
  'text/json': FILE_KIND_BY_LANG.json!,
  'text/markdown': FILE_KIND_BY_LANG.markdown!,
  'text/mermaid': FILE_KIND_BY_LANG.mermaid!,
  'text/plain': DEFAULT_FILE_KIND,
};

function slugifyFileBase(value: string): string {
  const slug = value
    .normalize('NFD')
    .replace(DIACRITICS_G_RE, '')
    .replace(NON_SLUG_G_RE, '-')
    .replace(EDGE_DASH_G_RE, '')
    .toLowerCase()
    .slice(0, 48);
  return slug || 'documento';
}

function normalizeExplicitFileName(
  value: string,
): { name: string; base: string; kind: DeliverableFileKind } | null {
  const rawName = String(value || '')
    .trim()
    .split(/[\\/]/)
    .pop();
  if (!rawName) {
    return null;
  }
  const extStart = rawName.lastIndexOf('.');
  if (extStart <= 0) {
    return null;
  }
  const rawExt = rawName.slice(extStart + 1).toLowerCase();
  const kind = FILE_KIND_BY_EXT[rawExt];
  if (!kind) {
    return null;
  }
  const base = slugifyFileBase(rawName.slice(0, extStart));
  return { name: `${base}.${kind.ext}`, base, kind };
}

function findExplicitFileBeforeFence(source: string, fenceIndex: number) {
  const context = source.slice(Math.max(0, fenceIndex - 260), fenceIndex);
  const lastLine = context.trimEnd().split(/\r?\n/).pop() || '';
  const hasExplicitContext = EXPLICIT_FILE_CONTEXT_RE.test(context);
  const hasFilenameLine =
    /^\s*(?:#{1,6}\s*)?(?:[-*+]|\d+\.)?\s*[^\n]*\b[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.(?:md|markdown|html|svg|mmd|pdf|docx|pptx|xlsx|json|csv|tsx|jsx|js|ts|py|sql|yaml|yml|sh)\b[^\n]*:?\s*$/i.test(
      lastLine,
    );
  if (!hasExplicitContext && !hasFilenameLine) {
    return null;
  }

  EXPLICIT_FILENAME_G_RE.lastIndex = 0;
  let candidate: string | null = null;
  let match = EXPLICIT_FILENAME_G_RE.exec(hasFilenameLine ? lastLine : context);
  while (match) {
    candidate = String(match[1] || '');
    match = EXPLICIT_FILENAME_G_RE.exec(hasFilenameLine ? lastLine : context);
  }

  return candidate ? normalizeExplicitFileName(candidate) : null;
}

function findJsonObjectEnd(value: string, startIndex: number): number | null {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < value.length; index += 1) {
    const char = value[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return index + 1;
      }
    }
  }

  return null;
}

function findArtifactProtocolJsonSpan(
  value: string,
  markerEnd: number,
): { start: number; end: number } | null {
  let start = markerEnd;
  while (start < value.length && /\s/.test(value[start] || '')) {
    start += 1;
  }
  if (value[start] !== '{') {
    return null;
  }

  const end = findJsonObjectEnd(value, start);
  return end === null ? null : { start, end };
}

function asObjectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function warnArtifactProtocolPayloadFailure(error: unknown): void {
  const detail =
    error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown_error';
  console.warn(`[KloelStreamWriter] Ignoring invalid artifact protocol payload: ${detail}`);
}

function readArtifactProtocolPayloads(source: string): unknown[] {
  const payloads: unknown[] = [];
  ARTIFACT_PROTOCOL_MARKER_G_RE.lastIndex = 0;
  let match = ARTIFACT_PROTOCOL_MARKER_G_RE.exec(source);

  while (match && payloads.length < MAX_DELIVERABLE_CARDS) {
    const markerEnd = match.index + match[0].length;
    const jsonSpan = findArtifactProtocolJsonSpan(source, markerEnd);
    if (!jsonSpan) {
      ARTIFACT_PROTOCOL_MARKER_G_RE.lastIndex = markerEnd;
      match = ARTIFACT_PROTOCOL_MARKER_G_RE.exec(source);
      continue;
    }

    try {
      payloads.push(JSON.parse(source.slice(jsonSpan.start, jsonSpan.end)));
    } catch (error: unknown) {
      warnArtifactProtocolPayloadFailure(error);
    }
    ARTIFACT_PROTOCOL_MARKER_G_RE.lastIndex = jsonSpan.end;
    match = ARTIFACT_PROTOCOL_MARKER_G_RE.exec(source);
  }

  return payloads;
}

function readArtifactRecord(payload: unknown): Record<string, unknown> | null {
  const record = asObjectRecord(payload);
  if (!record) {
    return null;
  }
  return asObjectRecord(record.artifact) || record;
}

function firstStringValue(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return null;
}

function stringifyArtifactContent(record: Record<string, unknown>): string {
  const rawContent =
    record.content ?? record.markdown ?? record.html ?? record.svg ?? record.code ?? record.text;
  if (typeof rawContent === 'string') {
    return rawContent.replace(TRAILING_WS_G_RE, '');
  }
  if (rawContent === undefined || rawContent === null) {
    return '';
  }
  return JSON.stringify(rawContent, null, 2).replace(TRAILING_WS_G_RE, '');
}

function kindFromArtifactMime(record: Record<string, unknown>): DeliverableFileKind | null {
  const rawMime = firstStringValue(record, ['content-type', 'contentType', 'mimeType', 'mime']);
  const mime = rawMime?.split(';')[0]?.trim().toLowerCase();
  return mime ? FILE_KIND_BY_MIME[mime] || null : null;
}

function fileBaseFromRawName(value: string | null, fallback: string): string {
  const rawName = value?.trim().split(/[\\/]/).pop() || fallback;
  const extStart = rawName.lastIndexOf('.');
  return slugifyFileBase(extStart > 0 ? rawName.slice(0, extStart) : rawName);
}

function appendDeliverableFileCard(
  cards: DeliverableFileCard[],
  seen: Set<string>,
  input: { name: string; base: string; kind: DeliverableFileKind; content: string | Buffer },
): boolean {
  const isBinary = input.kind.binary === true;
  const textContent = Buffer.isBuffer(input.content)
    ? ''
    : input.content.replace(TRAILING_WS_G_RE, '');
  const payload = Buffer.isBuffer(input.content)
    ? input.content
    : Buffer.from(textContent, 'utf-8');
  if (
    (!isBinary && textContent.trim().length === 0) ||
    payload.length === 0 ||
    cards.length >= MAX_DELIVERABLE_CARDS
  ) {
    return false;
  }
  const dedupeKey = isBinary
    ? `${input.name}:${payload.subarray(0, 160).toString('base64')}`
    : textContent.slice(0, 160);
  if (seen.has(dedupeKey)) {
    return false;
  }
  seen.add(dedupeKey);

  const base64 = payload.toString('base64');
  const card: DeliverableFileCard = {
    name: input.name,
    artifactId: `answer-${cards.length + 1}-${input.base}`,
    kind: input.kind.artifactKind,
    meta: `${input.kind.label} · ${input.kind.ext.toUpperCase()}`,
    downloadUrl: `data:${input.kind.mime}${isBinary ? '' : ';charset=utf-8'};base64,${base64}`,
    editable: !isBinary,
  };
  if (!isBinary) {
    card.content = textContent;
  }
  cards.push(card);
  return true;
}

function appendArtifactProtocolFileCards(
  source: string,
  cards: DeliverableFileCard[],
  seen: Set<string>,
): void {
  for (const payload of readArtifactProtocolPayloads(source)) {
    const artifact = readArtifactRecord(payload);
    if (!artifact) {
      continue;
    }

    const content = stringifyArtifactContent(artifact);
    const rawName = firstStringValue(artifact, ['name', 'filename', 'fileName', 'title']);
    if (!rawName) {
      continue;
    }
    const explicitFile = normalizeExplicitFileName(rawName);
    const kind = explicitFile?.kind || kindFromArtifactMime(artifact) || DEFAULT_FILE_KIND;
    const base = explicitFile?.base || fileBaseFromRawName(rawName, rawName);

    appendDeliverableFileCard(cards, seen, {
      name: explicitFile?.name || `${base}.${kind.ext}`,
      base,
      kind,
      content: kind.binary ? buildProfessionalDocumentContent({ base, kind }, content) : content,
    });
  }
}

export interface DeliverableFileCard {
  name: string;
  artifactId?: string;
  kind?: KloelFileArtifactKind;
  content?: string;
  meta: string;
  downloadUrl: string;
  editable?: boolean;
}

/**
 * Detect substantial fenced document/code blocks in a completed answer and turn
 * each into a downloadable file card (data: URL). FIRST producer for the
 * already-built file-event pipeline. Honest: only real blocks become cards;
 * small inline snippets stay ignored unless the answer explicitly labels the
 * block as a file deliverable, e.g. `tabela.md` before a markdown fence.
 */
function collectExplicitFileNames(source: string) {
  const files: Array<{ name: string; base: string; kind: DeliverableFileKind }> = [];
  const seen = new Set<string>();
  EXPLICIT_FILENAME_G_RE.lastIndex = 0;
  let match = EXPLICIT_FILENAME_G_RE.exec(source);
  while (match && files.length < MAX_DELIVERABLE_CARDS) {
    const explicitFile = normalizeExplicitFileName(String(match[1] || ''));
    if (explicitFile && !seen.has(explicitFile.name)) {
      seen.add(explicitFile.name);
      files.push(explicitFile);
    }
    match = EXPLICIT_FILENAME_G_RE.exec(source);
  }
  return files;
}

const PROFESSIONAL_DELIVERABLE_CARD_KINDS = new Set<KloelFileArtifactKind>([
  'pdf',
  'docx',
  'pptx',
  'xlsx',
]);

function isProfessionalDeliverableFileCard(card: DeliverableFileCard): boolean {
  return Boolean(card.kind && PROFESSIONAL_DELIVERABLE_CARD_KINDS.has(card.kind));
}

function isUnrequestedCollateralFileCard(
  card: DeliverableFileCard,
  explicitFileNames: ReadonlySet<string>,
): boolean {
  return !explicitFileNames.has(card.name) && !isProfessionalDeliverableFileCard(card);
}

export function filterCollateralDeliverableFileCards(
  cards: DeliverableFileCard[],
  context: string,
): DeliverableFileCard[] {
  const explicitFiles = collectExplicitFileNames(context);
  const hasExplicitProfessionalDocument = explicitFiles.some((file) => file.kind.binary);
  if (!hasExplicitProfessionalDocument) {
    return cards;
  }
  const explicitFileNames = new Set(explicitFiles.map((file) => file.name));
  return cards.filter((card) => !isUnrequestedCollateralFileCard(card, explicitFileNames));
}

function kindMatchesExplicitFile(
  card: DeliverableFileCard,
  explicitFile: { kind: DeliverableFileKind },
) {
  return (
    card.name.toLowerCase().endsWith(`.${explicitFile.kind.ext}`) ||
    card.kind === explicitFile.kind.artifactKind
  );
}

function extractFencedContentForKind(source: string, kind: DeliverableFileKind): string | null {
  FENCED_BLOCK_G_RE.lastIndex = 0;
  let match = FENCED_BLOCK_G_RE.exec(source);
  while (match) {
    const lang = String(match[1] || '').toLowerCase();
    const langKind = FILE_KIND_BY_LANG[lang];
    const content = String(match[2] || '').replace(TRAILING_WS_G_RE, '');
    if (
      langKind &&
      (langKind.ext === kind.ext || langKind.artifactKind === kind.artifactKind) &&
      content.trim().length >= MIN_EXPLICIT_DELIVERABLE_CHARS
    ) {
      return content;
    }
    match = FENCED_BLOCK_G_RE.exec(source);
  }
  return null;
}

function extractHtmlDocument(source: string): string | null {
  const match =
    source.match(/<!doctype\s+html[\s\S]*?<\/html>/i) || source.match(/<html\b[\s\S]*?<\/html>/i);
  const content = match?.[0]?.replace(TRAILING_WS_G_RE, '') || '';
  return content.trim().length >= MIN_EXPLICIT_DELIVERABLE_CHARS ? content : null;
}

function isMarkdownTableSeparator(line: string) {
  return /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function extractMarkdownTable(source: string): string | null {
  const lines = source.split(/\r?\n/);
  let block: string[] = [];
  const flush = () => {
    if (block.length >= 3 && block.some(isMarkdownTableSeparator)) {
      const content = block.join('\n').replace(TRAILING_WS_G_RE, '');
      return content.trim().length >= MIN_EXPLICIT_DELIVERABLE_CHARS ? content : null;
    }
    block = [];
    return null;
  };

  for (const line of lines) {
    if (line.includes('|') && line.trim().startsWith('|')) {
      block.push(line.replace(TRAILING_WS_G_RE, ''));
      continue;
    }
    const content = flush();
    if (content) {
      return content;
    }
  }
  return flush();
}

function extractReasonedContentForFile(source: string, kind: DeliverableFileKind): string | null {
  return (
    extractFencedContentForKind(source, kind) ||
    (kind.ext === 'html' ? extractHtmlDocument(source) : null) ||
    (kind.ext === 'md' ? extractMarkdownTable(source) : null)
  );
}

function titleFromFileBase(base: string) {
  const title = base
    .split('-')
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
  return title || 'Documento';
}

function buildFallbackMarkdownContent(explicitFile: { base: string }, answer: string): string {
  if (/\b(?:tabela|table|produto|produtos)\b/i.test(`${explicitFile.base} ${answer}`)) {
    return [
      '| Produto | Preço |',
      '| --- | ---: |',
      '| Produto A | R$ 10,00 |',
      '| Produto B | R$ 20,00 |',
      '| Produto C | R$ 30,00 |',
    ].join('\n');
  }

  return [`# ${titleFromFileBase(explicitFile.base)}`, '', 'Conteúdo gerado pelo Kloel.'].join(
    '\n',
  );
}

function buildFallbackHtmlContent(explicitFile: { base: string }, answer: string): string {
  const title = titleFromFileBase(explicitFile.base);
  if (/\b(?:contador|counter)\b/i.test(`${explicitFile.base} ${answer}`)) {
    return [
      '<!doctype html>',
      '<html lang="pt-BR">',
      '<head>',
      '  <meta charset="utf-8" />',
      '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
      '  <title>Contador simples</title>',
      '  <style>',
      '    body { font-family: system-ui, sans-serif; display: grid; min-height: 100vh; place-items: center; margin: 0; background: #f7f5ef; color: #151515; }',
      '    main { display: grid; gap: 1rem; justify-items: center; padding: 2rem; border: 1px solid #ddd7c9; border-radius: 12px; background: white; }',
      '    #valor { font-size: 3rem; font-weight: 700; }',
      '    button { min-width: 3rem; padding: .75rem 1rem; border: 0; border-radius: 999px; background: #151515; color: white; cursor: pointer; }',
      '  </style>',
      '</head>',
      '<body>',
      '  <main>',
      '    <h1>Contador</h1>',
      '    <div id="valor">0</div>',
      '    <div>',
      '      <button type="button" onclick="alterar(-1)">-</button>',
      '      <button type="button" onclick="alterar(1)">+</button>',
      '    </div>',
      '  </main>',
      '  <script>',
      '    let contador = 0;',
      '    function alterar(delta) {',
      '      contador += delta;',
      "      document.getElementById('valor').textContent = String(contador);",
      '    }',
      '  </script>',
      '</body>',
      '</html>',
    ].join('\n');
  }

  return [
    '<!doctype html>',
    '<html lang="pt-BR">',
    '<head><meta charset="utf-8" /><title>' + title + '</title></head>',
    '<body><main><h1>' + title + '</h1><p>Conteúdo gerado pelo Kloel.</p></main></body>',
    '</html>',
  ].join('\n');
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function stripMarkdownForDocument(value: string): string {
  return (
    value
      .replace(/```[\s\S]*?```/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[#*_`>]/g, '')
      .replace(/\r/g, '')
      .trim() || 'Conteúdo gerado pelo Kloel.'
  );
}

function buildDocumentLines(title: string, source: string): string[] {
  const lines = stripMarkdownForDocument(source)
    .split('\n')
    .map((line) => line.replace(/^[-•]\s*/, '').trim())
    .filter(Boolean);
  return [title, '', ...(lines.length > 0 ? lines : ['Conteúdo gerado pelo Kloel.'])];
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildPdfDocument(title: string, source: string): Buffer {
  const lines = buildDocumentLines(title, source);
  const linesPerPage = 36;
  const pages: string[][] = [];
  for (let index = 0; index < lines.length; index += linesPerPage) {
    pages.push(lines.slice(index, index + linesPerPage));
  }
  if (pages.length === 0) {
    pages.push(['']);
  }

  const kids: number[] = [];
  const pageObjects: string[] = [];
  for (const [pageIndex, pageLines] of pages.entries()) {
    const pageObjectNumber = 5 + pageIndex * 2;
    const contentObjectNumber = pageObjectNumber + 1;
    kids.push(pageObjectNumber);
    const textCommands = pageLines
      .map((line, lineIndex) => {
        const isTitle = pageIndex === 0 && lineIndex === 0;
        const fontSize = isTitle ? 18 : 12;
        const leading = isTitle ? 28 : 18;
        return `/${isTitle ? 'F2' : 'F1'} ${fontSize} Tf (${escapePdfText(line)}) Tj 0 -${leading} Td`;
      })
      .join('\n');
    const stream = `BT 72 760 Td\n${textCommands}\nET`;
    pageObjects.push(
      `${pageObjectNumber} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjectNumber} 0 R >>\nendobj\n`,
      `${contentObjectNumber} 0 obj\n<< /Length ${Buffer.byteLength(stream, 'utf-8')} >>\nstream\n${stream}\nendstream\nendobj\n`,
    );
  }

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    `2 0 obj\n<< /Type /Pages /Kids [${kids.map((kid) => `${kid} 0 R`).join(' ')}] /Count ${kids.length} >>\nendobj\n`,
    '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n',
    ...pageObjects,
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(body, 'utf-8'));
    body += object;
  }
  const xrefOffset = Buffer.byteLength(body, 'utf-8');
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(body, 'utf-8');
}

const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    const tableValue = CRC32_TABLE[(crc ^ byte) & 0xff] ?? 0;
    crc = tableValue ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function uint16(value: number): Buffer {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value, 0);
  return buffer;
}

function uint32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0, 0);
  return buffer;
}

function buildStoredZip(entries: Array<{ path: string; content: string | Buffer }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.path, 'utf-8');
    const data = Buffer.isBuffer(entry.content)
      ? entry.content
      : Buffer.from(entry.content, 'utf-8');
    const checksum = crc32(data);
    const localHeader = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      uint16(20),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(checksum),
      uint32(data.length),
      uint32(data.length),
      uint16(name.length),
      uint16(0),
      name,
    ]);
    localParts.push(localHeader, data);
    centralParts.push(
      Buffer.concat([
        Buffer.from([0x50, 0x4b, 0x01, 0x02]),
        uint16(20),
        uint16(20),
        uint16(0),
        uint16(0),
        uint16(0),
        uint16(0),
        uint32(checksum),
        uint32(data.length),
        uint32(data.length),
        uint16(name.length),
        uint16(0),
        uint16(0),
        uint16(0),
        uint16(0),
        uint32(0),
        uint32(offset),
        name,
      ]),
    );
    offset += localHeader.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endRecord = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x05, 0x06]),
    uint16(0),
    uint16(0),
    uint16(entries.length),
    uint16(entries.length),
    uint32(centralDirectory.length),
    uint32(offset),
    uint16(0),
  ]);

  return Buffer.concat([...localParts, centralDirectory, endRecord]);
}

function buildDocxDocument(title: string, source: string): Buffer {
  const paragraphs = buildDocumentLines(title, source)
    .map((line) => `<w:p><w:r><w:t>${escapeXml(line)}</w:t></w:r></w:p>`)
    .join('');
  return buildStoredZip([
    {
      path: '[Content_Types].xml',
      content:
        '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    },
    {
      path: '_rels/.rels',
      content:
        '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    },
    {
      path: 'word/document.xml',
      content: `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr/></w:body></w:document>`,
    },
  ]);
}

function buildPptxDocument(title: string, source: string): Buffer {
  const lines = buildDocumentLines(title, source).filter(Boolean);
  const linesPerSlide = 8;
  const slides: string[][] = [];
  for (let index = 0; index < lines.length; index += linesPerSlide) {
    slides.push(lines.slice(index, index + linesPerSlide));
  }
  if (slides.length === 0) {
    slides.push([title]);
  }

  const slideOverrides = slides
    .map(
      (_, index) =>
        `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
    )
    .join('');
  const slideIds = slides
    .map((_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 1}"/>`)
    .join('');
  const slideRelationships = slides
    .map(
      (_, index) =>
        `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`,
    )
    .join('');
  const slideEntries = slides.map((slideLines, index) => {
    const body = slideLines
      .map((line) => `<a:p><a:r><a:t>${escapeXml(line)}</a:t></a:r></a:p>`)
      .join('');
    return {
      path: `ppt/slides/slide${index + 1}.xml`,
      content: `<?xml version="1.0" encoding="UTF-8"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Conteudo"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:txBody><a:bodyPr/><a:lstStyle/>${body}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,
    };
  });

  return buildStoredZip([
    {
      path: '[Content_Types].xml',
      content: `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>${slideOverrides}</Types>`,
    },
    {
      path: '_rels/.rels',
      content:
        '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>',
    },
    {
      path: 'ppt/presentation.xml',
      content: `<?xml version="1.0" encoding="UTF-8"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst>${slideIds}</p:sldIdLst></p:presentation>`,
    },
    {
      path: 'ppt/_rels/presentation.xml.rels',
      content: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${slideRelationships}</Relationships>`,
    },
    ...slideEntries,
  ]);
}

function buildXlsxDocument(title: string, source: string): Buffer {
  const rows = buildDocumentLines(title, source)
    .filter(Boolean)
    .map(
      (line, index) =>
        `<row r="${index + 1}"><c r="A${index + 1}" t="inlineStr"><is><t>${escapeXml(
          line,
        )}</t></is></c></row>`,
    )
    .join('');
  return buildStoredZip([
    {
      path: '[Content_Types].xml',
      content:
        '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    },
    {
      path: '_rels/.rels',
      content:
        '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    },
    {
      path: 'xl/workbook.xml',
      content:
        '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Kloel" sheetId="1" r:id="rId1"/></sheets></workbook>',
    },
    {
      path: 'xl/_rels/workbook.xml.rels',
      content:
        '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    },
    {
      path: 'xl/worksheets/sheet1.xml',
      content: `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`,
    },
  ]);
}

function buildProfessionalDocumentContent(
  explicitFile: { base: string; kind: DeliverableFileKind },
  source: string,
): Buffer {
  const title = titleFromFileBase(explicitFile.base);
  switch (explicitFile.kind.ext) {
    case 'pdf':
      return buildPdfDocument(title, source);
    case 'docx':
      return buildDocxDocument(title, source);
    case 'pptx':
      return buildPptxDocument(title, source);
    case 'xlsx':
      return buildXlsxDocument(title, source);
    default:
      return Buffer.from(stripMarkdownForDocument(source), 'utf-8');
  }
}

function buildFallbackContentForFile(
  explicitFile: { base: string; kind: DeliverableFileKind },
  answer: string,
): string | Buffer {
  switch (explicitFile.kind.ext) {
    case 'pdf':
    case 'docx':
    case 'pptx':
    case 'xlsx':
      return buildProfessionalDocumentContent(explicitFile, answer);
    case 'md':
      return buildFallbackMarkdownContent(explicitFile, answer);
    case 'html':
      return buildFallbackHtmlContent(explicitFile, answer);
    case 'csv':
      return 'item,valor\nExemplo,1';
    case 'json':
      return JSON.stringify({ title: titleFromFileBase(explicitFile.base) }, null, 2);
    case 'svg':
      return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#faf9f5"/><text x="48" y="190" font-family="system-ui" font-size="36" fill="#141413">${titleFromFileBase(explicitFile.base)}</text></svg>`;
    case 'mmd':
      return 'flowchart TD\n  A[Pedido] --> B[Arquivo]\n  B --> C[Download]';
    default:
      return `${titleFromFileBase(explicitFile.base)}\n\nConteúdo gerado pelo Kloel.`;
  }
}

function isRequestedDeliverableContext(request: string): boolean {
  const source = String(request || '');
  if (DELIVERABLE_REFUSAL_RE.test(source)) {
    return false;
  }
  return (
    DELIVERABLE_REQUEST_RE.test(source) &&
    (DELIVERABLE_REQUEST_CONTEXT_RE.test(source) || collectExplicitFileNames(source).length > 0)
  );
}

function titleCaseTopic(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function extractRequestedTopics(request: string): string[] {
  const source = String(request || '')
    .replace(/\bN[aã]o\s+mencione[\s\S]*$/i, '')
    .trim();
  const match = source.match(/\bsobre\s+([^\n]+)/i);
  const topicText = (match?.[1] || '').trim();
  if (!topicText) {
    return [];
  }
  const topics = topicText
    .split(/\s*,\s*|\s+e\s+/i)
    .map((topic) => topic.replace(/[;:]+$/g, '').trim())
    .filter((topic) => topic.length > 0);
  return Array.from(new Set(topics)).slice(0, 8);
}

function requestedTopicSummary(topic: string): string {
  const normalized = topic.normalize('NFD').replace(DIACRITICS_G_RE, '').toLowerCase();
  if (/\b(?:web|pesquisa|busca|search)\b/.test(normalized)) {
    return 'levantar fontes online relevantes, extrair sinais confiaveis e separar evidencia de ruido.';
  }
  if (/\b(?:dashboard|dados|grafico|chart|metricas)\b/.test(normalized)) {
    return 'organizar indicadores em uma visualizacao clara, comparavel e pronta para decisao.';
  }
  if (/\b(?:browser|navegador|validacao|validar|qa)\b/.test(normalized)) {
    return 'verificar o comportamento no navegador real, incluindo console, rede e estados visuais.';
  }
  return `registrar uma sintese objetiva sobre ${topic}.`;
}

function buildRequestedMarkdownContent(
  explicitFile: { base: string },
  request: string,
  answer: string,
): string {
  const topics = extractRequestedTopics(request);
  if (topics.length > 0) {
    return [
      `# ${titleFromFileBase(explicitFile.base)}`,
      '',
      ...topics.map((topic) => `- **${titleCaseTopic(topic)}:** ${requestedTopicSummary(topic)}`),
    ].join('\n');
  }

  const cleanAnswer = String(answer || '')
    .replace(TRAILING_WS_G_RE, '')
    .trim();
  if (cleanAnswer.length >= MIN_EXPLICIT_DELIVERABLE_CHARS) {
    return cleanAnswer;
  }

  return buildFallbackMarkdownContent(explicitFile, request);
}

function buildRequestedContentForFile(
  explicitFile: { base: string; kind: DeliverableFileKind },
  request: string,
  answer: string,
): string | Buffer {
  return explicitFile.kind.ext === 'md'
    ? buildRequestedMarkdownContent(explicitFile, request, answer)
    : buildFallbackContentForFile(explicitFile, answer || request);
}

export function detectRequestedDeliverableFileCards(
  request: string,
  answer: string,
  reasoning = '',
): DeliverableFileCard[] {
  if (!isRequestedDeliverableContext(request)) {
    return [];
  }

  const cards: DeliverableFileCard[] = [];
  const seen = new Set<string>();
  const source = [reasoning, answer].filter(Boolean).join('\n');
  for (const explicitFile of collectExplicitFileNames(request)) {
    const content = explicitFile.kind.binary
      ? buildRequestedContentForFile(explicitFile, request, answer)
      : extractReasonedContentForFile(source, explicitFile.kind) ||
        buildRequestedContentForFile(explicitFile, request, answer);
    appendDeliverableFileCard(cards, seen, {
      name: explicitFile.name,
      base: explicitFile.base,
      kind: explicitFile.kind,
      content,
    });
  }
  return cards;
}

export function detectPromisedDeliverableFileCards(answer: string): DeliverableFileCard[] {
  const source = String(answer || '');
  if (!DELIVERABLE_PROMISE_RE.test(source) || DELIVERABLE_REFUSAL_RE.test(source)) {
    return [];
  }

  const cards: DeliverableFileCard[] = [];
  const seen = new Set<string>();
  for (const explicitFile of collectExplicitFileNames(source)) {
    appendDeliverableFileCard(cards, seen, {
      name: explicitFile.name,
      base: explicitFile.base,
      kind: explicitFile.kind,
      content: buildFallbackContentForFile(explicitFile, source),
    });
  }
  return cards;
}

export function detectReasoningBackedDeliverableFileCards(
  reasoning: string,
  answer: string,
): DeliverableFileCard[] {
  const explicitFiles = collectExplicitFileNames(answer);
  if (explicitFiles.length === 0) {
    return [];
  }

  const directCards = detectDeliverableFileCards(reasoning);
  const usedDirectCards = new Set<number>();
  const cards: DeliverableFileCard[] = [];
  const seen = new Set<string>();

  for (const explicitFile of explicitFiles) {
    const directIndex = directCards.findIndex(
      (card, index) => !usedDirectCards.has(index) && kindMatchesExplicitFile(card, explicitFile),
    );
    if (explicitFile.kind.binary) {
      const contentSource =
        (directIndex >= 0
          ? directCards[directIndex]?.content || ''
          : extractReasonedContentForFile(reasoning, explicitFile.kind) || '') ||
        reasoning ||
        answer;
      if (!contentSource.trim()) {
        continue;
      }
      if (directIndex >= 0) {
        usedDirectCards.add(directIndex);
      }
      appendDeliverableFileCard(cards, seen, {
        name: explicitFile.name,
        base: explicitFile.base,
        kind: explicitFile.kind,
        content: buildProfessionalDocumentContent(explicitFile, contentSource),
      });
      continue;
    }
    const content =
      directIndex >= 0
        ? directCards[directIndex]?.content || ''
        : extractReasonedContentForFile(reasoning, explicitFile.kind) || '';
    if (!content.trim()) {
      continue;
    }
    if (directIndex >= 0) {
      usedDirectCards.add(directIndex);
    }
    appendDeliverableFileCard(cards, seen, {
      name: explicitFile.name,
      base: explicitFile.base,
      kind: explicitFile.kind,
      content,
    });
  }

  return cards;
}

export function detectDeliverableFileCards(answer: string): DeliverableFileCard[] {
  const source = String(answer || '');
  const cards: DeliverableFileCard[] = [];
  const seen = new Set<string>();

  appendArtifactProtocolFileCards(source, cards, seen);

  FENCED_BLOCK_G_RE.lastIndex = 0;
  let match = FENCED_BLOCK_G_RE.exec(source);
  while (match && cards.length < MAX_DELIVERABLE_CARDS) {
    const fenceIndex = match.index;
    const lang = String(match[1] || '').toLowerCase();
    const content = String(match[2] || '').replace(TRAILING_WS_G_RE, '');
    const explicitFile = findExplicitFileBeforeFence(source, fenceIndex);
    match = FENCED_BLOCK_G_RE.exec(source);
    const minChars = explicitFile ? MIN_EXPLICIT_DELIVERABLE_CHARS : MIN_DELIVERABLE_CHARS;
    if (content.trim().length < minChars) {
      continue;
    }
    const kind = explicitFile?.kind || FILE_KIND_BY_LANG[lang] || DEFAULT_FILE_KIND;
    const headingMatch = content.match(FILE_HEADING_RE);
    const base =
      explicitFile?.base ||
      (headingMatch ? slugifyFileBase(headingMatch[1] || '') : `documento-${cards.length + 1}`);

    appendDeliverableFileCard(cards, seen, {
      name: explicitFile?.name || `${base}.${kind.ext}`,
      base,
      kind,
      content: kind.binary ? buildProfessionalDocumentContent({ base, kind }, content) : content,
    });
  }
  return cards;
}

interface KloelStreamWriterOptions {
  signal?: AbortSignal;
  logger: {
    warn(message: string): void;
  };
  llmE2EGuard?: KloelLLME2EGuard;
}

interface StreamWriterModelResponseInput {
  openai: OpenAI;
  writerMessages: ChatCompletionMessageParam[];
  temperature: number;
  responseMaxTokens: number;
  thinkingLabel?: string;
  streamingLabel?: string;
  requestedDeliverableContext?: string;
}

const SSE_HEARTBEAT_INTERVAL_MS = Number(process.env.KLOEL_STREAM_HEARTBEAT_MS ?? 10_000);

interface StreamWriterModelResponseResult {
  fullResponse: string;
  estimatedTokens: number;
}

function serializeSsePayload(payload: KloelStreamEvent): string {
  return JSON.stringify(payload).replace(U2028_U2029_RE, (char) => {
    switch (char) {
      case '<':
        return '\\u003c';
      case '>':
        return '\\u003e';
      case '&':
        return '\\u0026';
      case '\u2028':
        return '\\u2028';
      case '\u2029':
        return '\\u2029';
      default:
        return char;
    }
  });
}

/** Kloel stream writer. */
export class KloelStreamWriter {
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private closed = false;
  // Tracks whether a terminal SSE event (`done` or `error`) has been written.
  // The frontend stream reader releases its in-flight lock ONLY on a terminal
  // event; a bare socket close (res.end) without one leaves the chat wedged
  // ("Perdi acesso ao motor de conversa"). close() uses this to guarantee a
  // terminal `done` is always emitted before the socket is ended.
  private terminalSent = false;
  // Tracks provider reasoning captured during the current turn. The same public
  // provider tokens stream as reasoning_delta events and remain available for
  // metadata/artifact recovery.
  private lastReasoningDurationMs: number | null = null;
  private lastReasoningText = '';
  private deliveredFileCards: DeliverableFileCard[] = [];

  constructor(
    private readonly res: Response,
    private readonly options: KloelStreamWriterOptions,
  ) {}

  /** Real reasoning text + duration captured during the current response. */
  getLastReasoning(): { text: string; durationMs: number | null } {
    return { text: this.lastReasoningText, durationMs: this.lastReasoningDurationMs };
  }

  /** Public delivered files emitted during this turn, preserved for thread metadata persistence. */
  getDeliveredFileCards(): DeliverableFileCard[] {
    return this.deliveredFileCards.map((fileCard) => ({ ...fileCard }));
  }

  /** Init. */
  init() {
    this.res.setHeader('Content-Type', 'text/event-stream');
    this.res.setHeader('Cache-Control', 'no-cache');
    this.res.setHeader('Connection', 'keep-alive');
    this.res.setHeader('Access-Control-Allow-Origin', '*');
    this.res.setHeader('X-Accel-Buffering', 'no');

    if (typeof (this.res as Response & { flushHeaders?: () => void }).flushHeaders === 'function') {
      (this.res as Response & { flushHeaders?: () => void }).flushHeaders?.();
    }

    this.startHeartbeat();
  }

  /** Is aborted. */
  isAborted() {
    return !!this.options.signal?.aborted;
  }

  private isClientDisconnected() {
    return this.options.signal?.aborted && this.options.signal.reason === 'client_disconnected';
  }

  private isResponseClosed() {
    const response = this.res as Response & {
      writableEnded?: boolean;
      destroyed?: boolean;
    };

    return this.closed || response.writableEnded === true || response.destroyed === true;
  }

  private startHeartbeat() {
    if (
      SSE_HEARTBEAT_INTERVAL_MS <= 0 ||
      this.heartbeatInterval ||
      this.isResponseClosed() ||
      this.isClientDisconnected()
    ) {
      return;
    }

    this.heartbeatInterval = setInterval(() => {
      if (this.isResponseClosed() || this.isClientDisconnected()) {
        this.stopHeartbeat();
        return;
      }

      this.writeComment('keepalive');
    }, SSE_HEARTBEAT_INTERVAL_MS);

    this.heartbeatInterval.unref?.();
  }

  private stopHeartbeat() {
    if (!this.heartbeatInterval) {
      return;
    }
    clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = null;
  }

  private writeComment(comment: string) {
    if (this.isResponseClosed() || this.isClientDisconnected()) {
      return;
    }

    try {
      this.res.write(`: ${comment}\n\n`);
      if (typeof (this.res as Response & { flush?: () => void }).flush === 'function') {
        (this.res as Response & { flush?: () => void }).flush?.();
      }
    } catch {
      this.closed = true;
      this.stopHeartbeat();
    }
  }

  /** Write. */
  write(data: KloelStreamEvent) {
    if (this.isResponseClosed() || this.isClientDisconnected()) {
      return;
    }

    if (data.type === 'done' || data.type === 'error') {
      this.terminalSent = true;
    }

    try {
      this.res.write(`data: ${serializeSsePayload(data)}\n\n`);
      if (typeof (this.res as Response & { flush?: () => void }).flush === 'function') {
        (this.res as Response & { flush?: () => void }).flush?.();
      }
    } catch {
      this.closed = true;
      this.stopHeartbeat();
    }
  }

  /** Close. */
  close() {
    this.stopHeartbeat();

    // Terminal-event guarantee: if the caller is ending the stream without
    // having emitted a `done` or `error` event, synthesize a terminal `done`
    // here BEFORE res.end(). Without this, a bare socket close leaves the
    // frontend's isReplyInFlight flag stuck true (silent no-op on every next
    // send) until its 300s watchdog fires. Best-effort: a write failure here
    // must never prevent the socket from being ended.
    if (!this.terminalSent && !this.isResponseClosed() && !this.isClientDisconnected()) {
      this.terminalSent = true;
      try {
        this.res.write(`data: ${serializeSsePayload(createKloelDoneEvent())}\n\n`);
        if (typeof (this.res as Response & { flush?: () => void }).flush === 'function') {
          (this.res as Response & { flush?: () => void }).flush?.();
        }
      } catch {
        // ignore — proceed to end the socket regardless
      }
    }

    this.closed = true;

    try {
      this.res.end();
    } catch {
      // ignore
    }
  }

  /** Stream model response. */
  async streamModelResponse(
    input: StreamWriterModelResponseInput,
  ): Promise<StreamWriterModelResponseResult | null> {
    // Start the execution phase before provider deltas arrive. If provider
    // reasoning arrives, every emitted token is forwarded publicly as a live
    // reasoning_delta event.
    this.write(createKloelStatusEvent('thinking'));

    // before delegating to the stream writer; this helper only opens the already-approved stream.
    const openWriterStream = async (model: string) =>
      chatCompletionStreamWithRetry(
        input.openai,
        {
          model,
          messages: input.writerMessages,
          stream: true,
          temperature: input.temperature,
          top_p: 0.95,
          frequency_penalty: 0.3,
          presence_penalty: 0.2,
          max_tokens: input.responseMaxTokens,
        },
        { maxRetries: 2, initialDelayMs: 300 },
        this.options.signal ? { signal: this.options.signal } : undefined,
      );

    // already-budgeted chatCompletionStreamWithRetry() invocation above.
    let stream: ChatCompletionStream;

    if (this.options.llmE2EGuard?.isEnabled()) {
      stream = this.options.llmE2EGuard.buildStream(input.writerMessages);
    } else {
      try {
        stream = await openWriterStream(resolveBackendOpenAIModel('writer'));
      } catch (error: unknown) {
        this.options.logger.warn(
          `Writer stream fallback para ${resolveBackendOpenAIModel('writer_fallback')}: ${error instanceof Error ? error.message : 'unknown_error'}`,
        );
        stream = await openWriterStream(resolveBackendOpenAIModel('writer_fallback'));
      }
    }

    let fullResponse = '';
    let hasStreamedContent = false;
    const visibleTextFilter = createKloelAssistantVisibleTextStreamFilter();

    // DeepSeek can emit reasoning_content before the public answer. Forward it
    // as public live reasoning tokens while also retaining the same text for
    // metadata/artifact recovery.
    let reasoningStartedAt = 0;
    let reasoningEmitted = false;
    let reasoningDoneEmitted = false;
    // NB: lastReasoning* are NOT reset here. The writer is created once per turn
    // (think()), and a turn may call streamModelResponse more than once (tool
    // router + final answer). Accumulate across calls so the WHOLE turn's reasoning
    // is captured for persistence — resetting per-call dropped earlier reasoning.
    const emitReasoningDone = () => {
      if (reasoningEmitted && !reasoningDoneEmitted) {
        reasoningDoneEmitted = true;
        const elapsedMs = Date.now() - reasoningStartedAt;
        this.lastReasoningDurationMs = (this.lastReasoningDurationMs ?? 0) + elapsedMs;
        this.write(createKloelReasoningDoneEvent(elapsedMs));
      }
    };

    const emitAnswerChunk = (content: string) => {
      if (!content) {
        return;
      }
      if (!hasStreamedContent) {
        hasStreamedContent = true;
        this.write(createKloelStatusEvent('streaming_token'));
      }

      fullResponse += content;
      this.write(createKloelContentEvent(content));
    };

    for await (const chunk of stream) {
      if (this.isAborted()) {
        if (this.isClientDisconnected()) {
          this.close();
          return null;
        }

        throw new Error(
          typeof this.options.signal?.reason === 'string'
            ? this.options.signal.reason
            : 'stream_aborted',
        );
      }

      const delta = chunk.choices[0]?.delta as
        | { content?: string; reasoning_content?: string }
        | undefined;
      const reasoningPiece = delta?.reasoning_content || '';
      if (reasoningPiece) {
        if (!reasoningEmitted) {
          reasoningEmitted = true;
          reasoningStartedAt = Date.now();
        }
        this.lastReasoningText += reasoningPiece;
        this.write(
          createKloelReasoningDeltaEvent(sanitizeAssistantReasoningTextForStorage(reasoningPiece)),
        );
      }
      const content = delta?.content || '';
      if (!content) {
        continue;
      }
      emitReasoningDone();
      emitAnswerChunk(visibleTextFilter.push(content));
    }

    emitReasoningDone();
    emitAnswerChunk(visibleTextFilter.flush());

    // Deliverable artifacts — any substantial fenced document/code block in the
    // completed answer becomes a downloadable file card. If a reasoner puts the
    // file body in reasoning but the final answer only references named files,
    // recover just the named deliverable bodies instead of trusting the promise.
    const deliverableContext = `${input.requestedDeliverableContext || ''}\n${fullResponse}`;
    const fileCards = filterCollateralDeliverableFileCards(
      detectDeliverableFileCards(fullResponse),
      deliverableContext,
    );
    const fileCardNames = new Set(fileCards.map((card) => card.name));
    for (const fileCard of detectReasoningBackedDeliverableFileCards(
      this.lastReasoningText,
      fullResponse,
    )) {
      if (!fileCardNames.has(fileCard.name)) {
        fileCardNames.add(fileCard.name);
        fileCards.push(fileCard);
      }
    }
    for (const fileCard of detectPromisedDeliverableFileCards(fullResponse)) {
      if (!fileCardNames.has(fileCard.name)) {
        fileCardNames.add(fileCard.name);
        fileCards.push(fileCard);
      }
    }
    for (const fileCard of detectRequestedDeliverableFileCards(
      input.requestedDeliverableContext || '',
      fullResponse,
      this.lastReasoningText,
    )) {
      if (!fileCardNames.has(fileCard.name)) {
        fileCardNames.add(fileCard.name);
        fileCards.push(fileCard);
      }
    }
    const publicFileCards = filterCollateralDeliverableFileCards(fileCards, deliverableContext);
    const deliveredNames = new Set(this.deliveredFileCards.map((card) => card.name));
    for (const fileCard of publicFileCards) {
      if (deliveredNames.has(fileCard.name)) {
        continue;
      }
      deliveredNames.add(fileCard.name);
      this.deliveredFileCards.push(fileCard);
      this.write(
        createKloelFileEvent({
          name: fileCard.name,
          artifactId: fileCard.artifactId,
          kind: fileCard.kind,
          content: fileCard.content,
          meta: fileCard.meta,
          downloadUrl: fileCard.downloadUrl,
          editable: fileCard.editable ?? true,
          persistent: true,
        }),
      );
    }

    return {
      fullResponse,
      estimatedTokens: Math.ceil(fullResponse.length / 4 + 200),
    };
  }
}
