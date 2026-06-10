/**
 * Pure helpers for the silent document→markdown composer capability.
 *
 * Converts user-attached documents (PDF text, DOCX, HTML, plain text) into
 * clean markdown without any new dependency: `htmlparser2` (already used by
 * the knowledge-base ingestion) handles HTML/OOXML parsing and Node's `zlib`
 * inflates the DOCX zip container. Framework-free and unit-testable — the
 * network/storage orchestration lives in `KloelComposerService`.
 *
 * @see backend/src/kloel/kloel-composer.service.ts
 */
import { inflateRawSync } from 'zlib';
import { Parser } from 'htmlparser2';

import { WHITESPACE_G_RE } from '../common/regex';

/** Document formats the converter understands. */
export type ConvertibleDocumentFormat = 'pdf' | 'docx' | 'html' | 'text';

/**
 * Structural attachment shape consumed by the document picker. Mirrors
 * `ComposerAttachmentMetadata` (kloel.service.composer.helpers) without
 * importing it, so this module stays dependency-free of the service layer.
 */
export interface ConvertibleDocumentAttachment {
  name?: string;
  mimeType?: string;
  kind?: string;
  url?: string | null;
}

const PDF_NAME_RE = /\.pdf$/i;
const DOCX_NAME_RE = /\.docx$/i;
const HTML_NAME_RE = /\.(?:html?|xhtml)$/i;
const TEXT_NAME_RE = /\.(?:txt|md|markdown)$/i;
const MARKDOWN_EXTENSION_RE = /\.[a-z0-9]+$/i;
const FILENAME_SEPARATOR_RE = /[^a-z0-9._-]+/gi;
const TRAILING_LINE_SPACE_RE = /[ \t]+$/gm;
const EXCESS_BLANK_LINES_RE = /\n{3,}/g;
const CARRIAGE_RETURN_RE = /\r\n?/g;
const DOCX_HEADING_STYLE_RE = /(?:heading|t[íi]?tulo)\s*([1-6])$/i;

/**
 * Resolve the convertible format of an attachment from its mime type and
 * filename. Returns null when the document cannot be converted locally
 * (e.g. legacy binary `.doc`, spreadsheets, images).
 */
export function resolveConvertibleDocumentFormat(
  name?: string,
  mimeType?: string,
): ConvertibleDocumentFormat | null {
  const mime = String(mimeType || '')
    .trim()
    .toLowerCase();
  const filename = String(name || '').trim();
  if (mime.includes('pdf') || PDF_NAME_RE.test(filename)) {
    return 'pdf';
  }
  if (mime.includes('officedocument.wordprocessingml') || DOCX_NAME_RE.test(filename)) {
    return 'docx';
  }
  if (mime.includes('html') || HTML_NAME_RE.test(filename)) {
    return 'html';
  }
  if (mime === 'text/plain' || mime === 'text/markdown' || TEXT_NAME_RE.test(filename)) {
    return 'text';
  }
  return null;
}

/**
 * Pick the first attachment that is a convertible document AND carries a
 * downloadable URL. Image/audio attachments and url-less rows are skipped.
 */
export function pickConvertibleDocumentAttachment(
  attachments: ConvertibleDocumentAttachment[] | null | undefined,
): ConvertibleDocumentAttachment | null {
  if (!Array.isArray(attachments)) {
    return null;
  }
  for (const attachment of attachments) {
    if (!attachment || typeof attachment !== 'object') {
      continue;
    }
    const url = typeof attachment.url === 'string' ? attachment.url.trim() : '';
    if (!url) {
      continue;
    }
    if (attachment.kind === 'image' || attachment.kind === 'audio') {
      continue;
    }
    if (resolveConvertibleDocumentFormat(attachment.name, attachment.mimeType)) {
      return attachment;
    }
  }
  return null;
}

/** Build the `.md` output filename from the source document name. */
export function buildConvertedMarkdownFilename(sourceName?: string): string {
  const base = String(sourceName || '')
    .trim()
    .replace(MARKDOWN_EXTENSION_RE, '')
    .replace(FILENAME_SEPARATOR_RE, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `${base || 'documento'}.md`;
}

/** Choose the storage folder used to persist a converted markdown document. */
export function convertedMarkdownStorageFolder(workspaceId: string | undefined): string {
  return workspaceId ? `kloel/${workspaceId}/converted-documents` : 'kloel/converted-documents';
}

/**
 * Normalize extracted plain text (PDF text layer, txt uploads) into tidy
 * markdown: unified newlines, no trailing spaces, max one blank line.
 */
export function plainTextToMarkdown(text: string): string {
  return String(text || '')
    .replace(CARRIAGE_RETURN_RE, '\n')
    .replace(TRAILING_LINE_SPACE_RE, '')
    .replace(EXCESS_BLANK_LINES_RE, '\n\n')
    .trim();
}

const HTML_SKIPPED_TAGS = new Set(['script', 'style', 'noscript', 'template', 'iframe', 'svg']);
const HTML_PARAGRAPH_TAGS = new Set([
  'p',
  'div',
  'section',
  'article',
  'header',
  'footer',
  'main',
  'aside',
  'figure',
  'figcaption',
  'tr',
]);

interface HtmlListFrame {
  ordered: boolean;
  index: number;
}

/**
 * Convert an HTML document into clean markdown using the SAX `Parser` from
 * htmlparser2 (same engine as knowledge-base ingestion). Covers headings,
 * paragraphs, ordered/unordered lists, links, emphasis, inline/fenced code,
 * blockquotes, horizontal rules and image alt text; `script`/`style` bodies
 * are dropped entirely.
 */
export function htmlToMarkdown(html: string): string {
  if (!String(html || '').trim()) {
    return '';
  }

  const blocks: string[] = [];
  let inline: string[] = [];
  let headingLevel = 0;
  let listItemPrefix = '';
  let blockquoteDepth = 0;
  let preDepth = 0;
  let titleDepth = 0;
  const skipStack: string[] = [];
  const listStack: HtmlListFrame[] = [];
  const linkHrefStack: string[] = [];

  const flushBlock = () => {
    const body = inline.join('');
    inline = [];
    const text = preDepth > 0 ? body.replace(CARRIAGE_RETURN_RE, '\n') : body.trim();
    if (!text) {
      headingLevel = 0;
      listItemPrefix = '';
      return;
    }
    let block = text;
    if (headingLevel > 0) {
      block = `${'#'.repeat(headingLevel)} ${text}`;
    } else if (listItemPrefix) {
      block = `${listItemPrefix}${text}`;
    }
    if (blockquoteDepth > 0) {
      block = block
        .split('\n')
        .map((line) => `${'> '.repeat(blockquoteDepth)}${line}`)
        .join('\n');
    }
    blocks.push(block);
    headingLevel = 0;
    listItemPrefix = '';
  };

  const parser = new Parser(
    {
      onopentag: (rawName, attribs) => {
        const name = rawName.toLowerCase();
        if (HTML_SKIPPED_TAGS.has(name)) {
          skipStack.push(name);
          return;
        }
        if (skipStack.length > 0) {
          return;
        }
        if (name === 'title') {
          flushBlock();
          titleDepth += 1;
          headingLevel = 1;
          return;
        }
        if (name === 'pre') {
          flushBlock();
          preDepth += 1;
          return;
        }
        if (/^h[1-6]$/.test(name)) {
          flushBlock();
          headingLevel = Number(name.slice(1));
          return;
        }
        if (name === 'ul' || name === 'ol') {
          flushBlock();
          listStack.push({ ordered: name === 'ol', index: 0 });
          return;
        }
        if (name === 'li') {
          flushBlock();
          const frame = listStack[listStack.length - 1];
          const indent = '  '.repeat(Math.max(listStack.length - 1, 0));
          if (frame?.ordered) {
            frame.index += 1;
            listItemPrefix = `${indent}${frame.index}. `;
          } else {
            listItemPrefix = `${indent}- `;
          }
          return;
        }
        if (name === 'blockquote') {
          flushBlock();
          blockquoteDepth += 1;
          return;
        }
        if (name === 'br') {
          inline.push('\n');
          return;
        }
        if (name === 'hr') {
          flushBlock();
          blocks.push('---');
          return;
        }
        if (name === 'img') {
          const alt = String(attribs.alt || '').trim();
          const src = String(attribs.src || '').trim();
          if (src) {
            inline.push(`![${alt}](${src})`);
          }
          return;
        }
        if (name === 'a') {
          linkHrefStack.push(String(attribs.href || '').trim());
          inline.push('[');
          return;
        }
        if (name === 'strong' || name === 'b') {
          inline.push('**');
          return;
        }
        if (name === 'em' || name === 'i') {
          inline.push('*');
          return;
        }
        if (name === 'code' && preDepth === 0) {
          inline.push('`');
          return;
        }
        if (name === 'td' || name === 'th') {
          if (inline.length > 0) {
            inline.push(' | ');
          }
          return;
        }
        if (HTML_PARAGRAPH_TAGS.has(name)) {
          flushBlock();
        }
      },
      ontext: (text) => {
        if (skipStack.length > 0) {
          return;
        }
        if (preDepth > 0) {
          inline.push(text);
          return;
        }
        const normalized = text.replace(WHITESPACE_G_RE, ' ');
        if (normalized === ' ' && inline.length === 0) {
          return;
        }
        inline.push(normalized);
      },
      onclosetag: (rawName) => {
        const name = rawName.toLowerCase();
        if (skipStack.length > 0 && skipStack[skipStack.length - 1] === name) {
          skipStack.pop();
          return;
        }
        if (skipStack.length > 0) {
          return;
        }
        if (name === 'title') {
          flushBlock();
          titleDepth = Math.max(titleDepth - 1, 0);
          return;
        }
        if (name === 'pre') {
          const code = inline.join('').replace(CARRIAGE_RETURN_RE, '\n').replace(/^\n+|\n+$/g, '');
          inline = [];
          preDepth = Math.max(preDepth - 1, 0);
          if (code) {
            blocks.push(`\`\`\`\n${code}\n\`\`\``);
          }
          return;
        }
        if (/^h[1-6]$/.test(name) || name === 'li') {
          flushBlock();
          return;
        }
        if (name === 'ul' || name === 'ol') {
          flushBlock();
          listStack.pop();
          return;
        }
        if (name === 'blockquote') {
          flushBlock();
          blockquoteDepth = Math.max(blockquoteDepth - 1, 0);
          return;
        }
        if (name === 'a') {
          const href = linkHrefStack.pop() || '';
          inline.push(href ? `](${href})` : ']');
          return;
        }
        if (name === 'strong' || name === 'b') {
          inline.push('**');
          return;
        }
        if (name === 'em' || name === 'i') {
          inline.push('*');
          return;
        }
        if (name === 'code' && preDepth === 0) {
          inline.push('`');
          return;
        }
        if (HTML_PARAGRAPH_TAGS.has(name)) {
          flushBlock();
        }
      },
    },
    { decodeEntities: true },
  );

  parser.write(String(html || ''));
  parser.end();
  flushBlock();

  return blocks.join('\n\n').replace(EXCESS_BLANK_LINES_RE, '\n\n').trim();
}

const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_LOCAL_SIGNATURE = 0x04034b50;
const ZIP_EOCD_MIN_BYTES = 22;
const ZIP_MAX_COMMENT_BYTES = 0xffff;

/**
 * Extract a single entry from a ZIP container (a DOCX is one) using only
 * Node's zlib — no zip dependency exists in the backend. Walks the central
 * directory from the end-of-central-directory record and inflates the entry
 * payload (method 8) or returns the stored bytes (method 0). Returns null
 * when the container or the entry cannot be resolved; throws only when the
 * deflate stream itself is corrupt (zlib error), which callers map to the
 * user-facing conversion failure.
 */
export function extractZipEntry(buffer: Buffer, entryName: string): Buffer | null {
  if (!Buffer.isBuffer(buffer) || buffer.length < ZIP_EOCD_MIN_BYTES) {
    return null;
  }
  let eocdOffset = -1;
  const scanFloor = Math.max(0, buffer.length - ZIP_EOCD_MIN_BYTES - ZIP_MAX_COMMENT_BYTES);
  for (let i = buffer.length - ZIP_EOCD_MIN_BYTES; i >= scanFloor; i--) {
    if (buffer.readUInt32LE(i) === ZIP_EOCD_SIGNATURE) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) {
    return null;
  }
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  let cursor = buffer.readUInt32LE(eocdOffset + 16);
  for (let i = 0; i < entryCount; i++) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== ZIP_CENTRAL_SIGNATURE) {
      return null;
    }
    const compressionMethod = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf-8');
    if (name === entryName) {
      if (
        localHeaderOffset + 30 > buffer.length ||
        buffer.readUInt32LE(localHeaderOffset) !== ZIP_LOCAL_SIGNATURE
      ) {
        return null;
      }
      const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
      if (dataStart + compressedSize > buffer.length) {
        return null;
      }
      const data = buffer.subarray(dataStart, dataStart + compressedSize);
      if (compressionMethod === 0) {
        return Buffer.from(data);
      }
      if (compressionMethod === 8) {
        return inflateRawSync(data);
      }
      return null;
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return null;
}

/**
 * Convert the OOXML `word/document.xml` payload of a DOCX into markdown via
 * the htmlparser2 SAX parser in xmlMode. Paragraph styles named Heading1-6
 * (or Título1-6) become `#` headings, numbered paragraphs become list items,
 * tabs/breaks survive as whitespace.
 */
export function docxDocumentXmlToMarkdown(xml: string): string {
  if (!String(xml || '').trim()) {
    return '';
  }

  const blocks: string[] = [];
  let paragraph: string[] = [];
  let inTextRun = false;
  let inParagraphProperties = false;
  let headingLevel = 0;
  let isListItem = false;
  let listIndentLevel = 0;

  const flushParagraph = () => {
    const text = paragraph.join('').replace(TRAILING_LINE_SPACE_RE, '').trim();
    paragraph = [];
    if (!text) {
      headingLevel = 0;
      isListItem = false;
      listIndentLevel = 0;
      return;
    }
    if (headingLevel > 0) {
      blocks.push(`${'#'.repeat(headingLevel)} ${text}`);
    } else if (isListItem) {
      blocks.push(`${'  '.repeat(listIndentLevel)}- ${text}`);
    } else {
      blocks.push(text);
    }
    headingLevel = 0;
    isListItem = false;
    listIndentLevel = 0;
  };

  const parser = new Parser(
    {
      onopentag: (name, attribs) => {
        if (name === 'w:p') {
          paragraph = [];
          headingLevel = 0;
          isListItem = false;
          listIndentLevel = 0;
          return;
        }
        if (name === 'w:pPr') {
          inParagraphProperties = true;
          return;
        }
        if (name === 'w:pStyle' && inParagraphProperties) {
          const styleValue = String(attribs['w:val'] || '');
          const headingMatch = DOCX_HEADING_STYLE_RE.exec(styleValue);
          if (headingMatch?.[1]) {
            headingLevel = Number(headingMatch[1]);
          }
          return;
        }
        if (name === 'w:numPr' && inParagraphProperties) {
          isListItem = true;
          return;
        }
        if (name === 'w:ilvl' && inParagraphProperties && isListItem) {
          const levelValue = Number(attribs['w:val'] || 0);
          listIndentLevel = Number.isFinite(levelValue) ? Math.max(levelValue, 0) : 0;
          return;
        }
        if (name === 'w:t') {
          inTextRun = true;
          return;
        }
        if (name === 'w:tab') {
          paragraph.push('\t');
          return;
        }
        if (name === 'w:br' || name === 'w:cr') {
          paragraph.push('\n');
        }
      },
      ontext: (text) => {
        if (inTextRun) {
          paragraph.push(text);
        }
      },
      onclosetag: (name) => {
        if (name === 'w:t') {
          inTextRun = false;
          return;
        }
        if (name === 'w:pPr') {
          inParagraphProperties = false;
          return;
        }
        if (name === 'w:p') {
          flushParagraph();
        }
      },
    },
    { xmlMode: true, decodeEntities: true },
  );

  parser.write(String(xml || ''));
  parser.end();
  flushParagraph();

  return blocks.join('\n\n').trim();
}

/** The DOCX zip entry that carries the document body. */
export const DOCX_DOCUMENT_XML_ENTRY = 'word/document.xml';

/**
 * Convert a DOCX buffer to markdown: unzip `word/document.xml` (pure Node
 * zlib) then run the OOXML walker. Returns null when the buffer is not a
 * readable DOCX container.
 */
export function docxBufferToMarkdown(buffer: Buffer): string | null {
  const documentXml = extractZipEntry(buffer, DOCX_DOCUMENT_XML_ENTRY);
  if (!documentXml) {
    return null;
  }
  return docxDocumentXmlToMarkdown(documentXml.toString('utf-8'));
}
