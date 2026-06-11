/**
 * Shared test fixtures for the document→markdown converter specs.
 *
 * Consumed by `kloel-composer.document.helpers.spec.ts` (pure helpers) and
 * `kloel-composer.document.helpers.part2.spec.ts` (service executor). Kept
 * out of the spec files so both suites exercise the exact same code-built
 * DOCX/HTML inputs without duplicating the ZIP writer.
 */
import { deflateRawSync } from 'zlib';
import { DOCX_DOCUMENT_XML_ENTRY } from './kloel-composer.document.helpers';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export interface ZipFixtureEntry {
  name: string;
  data: Buffer;
  store?: boolean;
}

/**
 * Build a minimal-but-real ZIP container in code (local file headers +
 * central directory + EOCD) using only Node's zlib, mirroring exactly what
 * `extractZipEntry` walks in production. CRC fields stay zero because the
 * production reader never validates them.
 */
export function buildZipFixture(entries: ZipFixtureEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, 'utf-8');
    const method = entry.store ? 0 : 8;
    const payload = entry.store ? entry.data : deflateRawSync(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    localParts.push(local, nameBytes, payload);
    centralParts.push(central, nameBytes);
    offset += 30 + nameBytes.length + payload.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, eocd]);
}

/** OOXML body used by the DOCX fixtures: heading, paragraph and a nested list. */
export const DOCX_XML = [
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
  '<w:body>',
  '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Contrato de Teste</w:t></w:r></w:p>',
  '<w:p><w:r><w:t>Primeiro parágrafo do corpo.</w:t></w:r></w:p>',
  '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>',
  '<w:r><w:t>Item um</w:t></w:r></w:p>',
  '<w:p><w:pPr><w:numPr><w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr></w:pPr>',
  '<w:r><w:t>Subitem</w:t></w:r></w:p>',
  '</w:body>',
  '</w:document>',
].join('');

export function buildDocxFixture(): Buffer {
  return buildZipFixture([{ name: DOCX_DOCUMENT_XML_ENTRY, data: Buffer.from(DOCX_XML, 'utf-8') }]);
}

/** HTML document exercising every markdown construct the converter claims. */
export const HTML_FIXTURE = [
  '<html><head><title>Guia Kloel</title>',
  '<style>body { color: red; }</style>',
  '<script>alert("nunca");</script>',
  '</head><body>',
  '<h2>Seção Principal</h2>',
  '<p>Texto com <strong>negrito</strong>, <em>itálico</em> e ',
  '<a href="https://example.com/doc">um link</a>.</p>',
  '<ul><li>Primeiro item</li><li>Segundo item</li></ul>',
  '<ol><li>Um</li><li>Dois</li></ol>',
  '<blockquote><p>Citação direta</p></blockquote>',
  '<pre><code>const x = 1;</code></pre>',
  '<hr>',
  '<p><img src="https://example.com/logo.png" alt="Logo"></p>',
  '</body></html>',
].join('');
