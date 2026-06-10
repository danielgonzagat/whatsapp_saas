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
          const code = inline
            .join('')
            .replace(CARRIAGE_RETURN_RE, '\n')
            .replace(/^\n+|\n+$/g, '');
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

// The DOCX/ZIP conversions live in `kloel-composer.document.docx.helpers.ts`
// (architecture size guardrail); re-exported here so consumers keep a single
// import surface for document conversion.
export {
  DOCX_DOCUMENT_XML_ENTRY,
  docxBufferToMarkdown,
  docxDocumentXmlToMarkdown,
  extractZipEntry,
} from './kloel-composer.document.docx.helpers';
