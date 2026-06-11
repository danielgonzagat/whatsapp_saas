/**
 * DOCX/ZIP half of the silent document→markdown composer capability.
 *
 * Extracted verbatim from `kloel-composer.document.helpers.ts` so both
 * modules stay inside the architecture size guardrail: this file owns the
 * ZIP container walker (pure Node `zlib`, no zip dependency) and the OOXML
 * `word/document.xml` → markdown conversion. The HTML/plain-text converters
 * stay in `kloel-composer.document.helpers.ts`, which re-exports this module
 * so consumers keep a single import surface.
 *
 * @see backend/src/kloel/kloel-composer.document.helpers.ts
 */
import { inflateRawSync } from 'zlib';
import { Parser } from 'htmlparser2';

const TRAILING_LINE_SPACE_RE = /[ \t]+$/gm;
const DOCX_HEADING_STYLE_RE = /(?:heading|t[íi]?tulo)\s*([1-6])$/i;

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
