import { deflateRawSync } from 'zlib';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import {
  DOCX_DOCUMENT_XML_ENTRY,
  buildConvertedMarkdownFilename,
  convertedMarkdownStorageFolder,
  docxBufferToMarkdown,
  docxDocumentXmlToMarkdown,
  extractZipEntry,
  htmlToMarkdown,
  pickConvertibleDocumentAttachment,
  plainTextToMarkdown,
  resolveConvertibleDocumentFormat,
} from './kloel-composer.document.helpers';
import { buildComposerCapabilityTraceResult } from './kloel-thinker-think.helpers';
import { KloelComposerService } from './kloel-composer.service';
import {
  ERR_DOCUMENT_ATTACHMENT_MISSING,
  ERR_DOCUMENT_CONVERSION_FAILED,
  ERR_DOCUMENT_NO_TEXT,
} from './kloel-composer.service.helpers';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { StorageService } from '../common/storage/storage.service';
import { KLOEL_COMPOSER_E2E_GUARD } from './kloel-composer-e2e-guard';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

interface ZipFixtureEntry {
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
function buildZipFixture(entries: ZipFixtureEntry[]): Buffer {
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
const DOCX_XML = [
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

function buildDocxFixture(): Buffer {
  return buildZipFixture([{ name: DOCX_DOCUMENT_XML_ENTRY, data: Buffer.from(DOCX_XML, 'utf-8') }]);
}

/** HTML document exercising every markdown construct the converter claims. */
const HTML_FIXTURE = [
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

/**
 * The REAL pdf-parse engine cannot boot under this jest config: pdfjs-dist
 * sets up its fake worker through a dynamic ESM import, which Node's VM
 * blocks without --experimental-vm-modules ("Setting up fake worker failed").
 * The engine itself is real and proven outside jest (a plain-node run of
 * convertPdfBufferToMarkdown extracts the text of a code-built PDF), so the
 * executor spec mocks ONLY this module seam and asserts the routing and
 * normalization that wrap it.
 */
jest.mock('pdf-parse', () => ({
  PDFParse: class {
    getText(): Promise<{ text: string }> {
      return Promise.resolve({ text: 'Relatorio PDF real \r\n\r\n\r\n-- pagina 1 de 1 --  ' });
    }
    destroy(): Promise<void> {
      return Promise.resolve();
    }
  },
}));

describe('kloel-composer.document.helpers', () => {
  describe('resolveConvertibleDocumentFormat', () => {
    it('detects every convertible format via mime type', () => {
      expect(resolveConvertibleDocumentFormat('arquivo.bin', 'application/pdf')).toBe('pdf');
      expect(resolveConvertibleDocumentFormat('arquivo.bin', DOCX_MIME)).toBe('docx');
      expect(resolveConvertibleDocumentFormat('arquivo.bin', 'text/html')).toBe('html');
      expect(resolveConvertibleDocumentFormat('arquivo.bin', 'text/plain')).toBe('text');
      expect(resolveConvertibleDocumentFormat('arquivo.bin', 'text/markdown')).toBe('text');
    });

    it('detects every convertible format via filename when mime is generic', () => {
      expect(resolveConvertibleDocumentFormat('Relatório.PDF', 'application/octet-stream')).toBe(
        'pdf',
      );
      expect(resolveConvertibleDocumentFormat('contrato.docx', '')).toBe('docx');
      expect(resolveConvertibleDocumentFormat('pagina.html', '')).toBe('html');
      expect(resolveConvertibleDocumentFormat('notas.txt', '')).toBe('text');
      expect(resolveConvertibleDocumentFormat('guia.md', '')).toBe('text');
    });

    it('returns null for non-convertible documents', () => {
      expect(resolveConvertibleDocumentFormat('legado.doc', 'application/msword')).toBe(null);
      expect(resolveConvertibleDocumentFormat('planilha.xlsx', '')).toBe(null);
      expect(resolveConvertibleDocumentFormat('foto.png', 'image/png')).toBe(null);
      expect(resolveConvertibleDocumentFormat(undefined, undefined)).toBe(null);
    });
  });

  describe('pickConvertibleDocumentAttachment', () => {
    it('picks the first convertible attachment that carries a downloadable url', () => {
      const target = { name: 'contrato.docx', mimeType: DOCX_MIME, url: 'https://x.test/c.docx' };
      expect(
        pickConvertibleDocumentAttachment([
          { name: 'sem-url.docx', mimeType: DOCX_MIME, url: null },
          { name: 'foto.docx', kind: 'image', url: 'https://x.test/f' },
          { name: 'audio.docx', kind: 'audio', url: 'https://x.test/a' },
          target,
        ]),
      ).toBe(target);
    });

    it('returns null without a convertible attachment or without an array', () => {
      expect(pickConvertibleDocumentAttachment(undefined)).toBe(null);
      expect(pickConvertibleDocumentAttachment(null)).toBe(null);
      expect(pickConvertibleDocumentAttachment([])).toBe(null);
      expect(
        pickConvertibleDocumentAttachment([
          { name: 'foto.png', mimeType: 'image/png', url: 'https://x.test/f.png' },
        ]),
      ).toBe(null);
    });
  });

  describe('buildConvertedMarkdownFilename / convertedMarkdownStorageFolder', () => {
    it('slugifies the source name and swaps the extension for .md', () => {
      expect(buildConvertedMarkdownFilename('Contrato Final.docx')).toBe('contrato-final.md');
      expect(buildConvertedMarkdownFilename('Relatório.PDF')).toBe('relat-rio.md');
      expect(buildConvertedMarkdownFilename('')).toBe('documento.md');
      expect(buildConvertedMarkdownFilename('???')).toBe('documento.md');
    });

    it('scopes the storage folder per workspace', () => {
      expect(convertedMarkdownStorageFolder('ws-1')).toBe('kloel/ws-1/converted-documents');
      expect(convertedMarkdownStorageFolder(undefined)).toBe('kloel/converted-documents');
    });
  });

  describe('plainTextToMarkdown', () => {
    it('normalizes newlines, trailing spaces and blank-line runs', () => {
      expect(plainTextToMarkdown('linha um \r\nlinha dois\r\r\n\n\n\nfim  ')).toBe(
        'linha um\nlinha dois\n\nfim',
      );
      expect(plainTextToMarkdown('')).toBe('');
    });
  });

  describe('htmlToMarkdown', () => {
    it('converts headings, emphasis, links, lists, quotes, code, hr and images', () => {
      const markdown = htmlToMarkdown(HTML_FIXTURE);
      expect(markdown).toContain('# Guia Kloel');
      expect(markdown).toContain('## Seção Principal');
      expect(markdown).toContain('**negrito**');
      expect(markdown).toContain('*itálico*');
      expect(markdown).toContain('[um link](https://example.com/doc)');
      expect(markdown).toContain('- Primeiro item');
      expect(markdown).toContain('- Segundo item');
      expect(markdown).toContain('1. Um');
      expect(markdown).toContain('2. Dois');
      expect(markdown).toContain('> Citação direta');
      expect(markdown).toContain('```\nconst x = 1;\n```');
      expect(markdown).toContain('---');
      expect(markdown).toContain('![Logo](https://example.com/logo.png)');
    });

    it('drops script/style bodies entirely and returns empty for blank input', () => {
      const markdown = htmlToMarkdown(HTML_FIXTURE);
      expect(markdown).not.toContain('alert(');
      expect(markdown).not.toContain('color: red');
      expect(htmlToMarkdown('')).toBe('');
      expect(htmlToMarkdown('   ')).toBe('');
    });
  });

  describe('extractZipEntry', () => {
    it('extracts a deflated entry from a code-built zip container', () => {
      const data = Buffer.from(DOCX_XML, 'utf-8');
      const zip = buildZipFixture([
        { name: 'outro/arquivo.txt', data: Buffer.from('ruído', 'utf-8') },
        { name: DOCX_DOCUMENT_XML_ENTRY, data },
      ]);
      const extracted = extractZipEntry(zip, DOCX_DOCUMENT_XML_ENTRY);
      expect(extracted).not.toBeNull();
      expect(extracted?.equals(data)).toBe(true);
    });

    it('extracts a stored (method 0) entry', () => {
      const data = Buffer.from('conteúdo sem compressão', 'utf-8');
      const zip = buildZipFixture([{ name: 'plano.txt', data, store: true }]);
      expect(extractZipEntry(zip, 'plano.txt')?.equals(data)).toBe(true);
    });

    it('returns null for missing entries, garbage buffers and short buffers', () => {
      const zip = buildZipFixture([{ name: 'a.txt', data: Buffer.from('x') }]);
      expect(extractZipEntry(zip, 'inexistente.txt')).toBe(null);
      expect(extractZipEntry(Buffer.from('definitivamente não é um zip válido!'), 'a.txt')).toBe(
        null,
      );
      expect(extractZipEntry(Buffer.alloc(4), 'a.txt')).toBe(null);
    });
  });

  describe('docxDocumentXmlToMarkdown', () => {
    it('maps Heading/Título styles, numbered paragraphs and breaks', () => {
      expect(docxDocumentXmlToMarkdown(DOCX_XML)).toBe(
        '# Contrato de Teste\n\nPrimeiro parágrafo do corpo.\n\n- Item um\n\n  - Subitem',
      );
      expect(
        docxDocumentXmlToMarkdown(
          '<w:p><w:pPr><w:pStyle w:val="Titulo2"/></w:pPr><w:r><w:t>Cláusulas</w:t></w:r></w:p>',
        ),
      ).toBe('## Cláusulas');
      expect(
        docxDocumentXmlToMarkdown(
          '<w:p><w:r><w:t>linha um</w:t></w:r><w:br/><w:r><w:t>linha dois</w:t></w:r></w:p>',
        ),
      ).toBe('linha um\nlinha dois');
      expect(docxDocumentXmlToMarkdown('')).toBe('');
    });
  });

  describe('docxBufferToMarkdown', () => {
    it('unzips word/document.xml and converts the body to markdown', () => {
      expect(docxBufferToMarkdown(buildDocxFixture())).toBe(
        '# Contrato de Teste\n\nPrimeiro parágrafo do corpo.\n\n- Item um\n\n  - Subitem',
      );
    });

    it('returns null when the buffer is not a readable DOCX container', () => {
      expect(docxBufferToMarkdown(Buffer.from('x'.repeat(64)))).toBe(null);
    });
  });

  describe('buildComposerCapabilityTraceResult (zero-leak trace contract)', () => {
    it('redacts the converted markdown body from the public tool_result trace', () => {
      const secretMarkdown = '# Conteúdo Confidencial\n\nCorpo completo do documento.';
      const trace = buildComposerCapabilityTraceResult('document_to_markdown', {
        capability: 'document_to_markdown',
        convertedMarkdown: secretMarkdown,
        convertedDocumentFilename: 'contrato.md',
        convertedDocumentUrl: 'https://storage.test/contrato.md',
        sourceDocumentName: 'contrato.docx',
        sourceDocumentFormat: 'docx',
      });
      expect(trace).toEqual({
        capability: 'document_to_markdown',
        convertedMarkdownBytes: secretMarkdown.length,
        convertedMarkdownOmitted: true,
        convertedDocumentFilename: 'contrato.md',
        convertedDocumentUrl: 'https://storage.test/contrato.md',
        sourceDocumentName: 'contrato.docx',
        sourceDocumentFormat: 'docx',
      });
      expect(JSON.stringify(trace)).not.toContain('Conteúdo Confidencial');
    });

    it('keeps lightweight metadata untouched and stamps the capability id', () => {
      expect(buildComposerCapabilityTraceResult('document_to_markdown', undefined)).toEqual({
        capability: 'document_to_markdown',
      });
      expect(buildComposerCapabilityTraceResult('search_web', { webSources: [] })).toEqual({
        webSources: [],
        capability: 'search_web',
      });
    });
  });
});

describe('KloelComposerService document_to_markdown (executor)', () => {
  let service: KloelComposerService;
  let uploadMock: jest.Mock;
  let resolveLocalAccessTokenMock: jest.Mock;
  let readAccessFileMock: jest.Mock;

  const signedUrl = 'https://app.kloel.test/storage/local/tok-abc.sig1';

  function attachmentMetadata(name: string, mimeType: string) {
    return { attachments: [{ name, mimeType, kind: 'document', url: signedUrl }] };
  }

  beforeEach(async () => {
    uploadMock = jest.fn().mockResolvedValue({ url: 'https://storage.test/converted/doc.md' });
    resolveLocalAccessTokenMock = jest.fn().mockReturnValue({
      relativePath: 'uploads/ws-1/origem.bin',
      absolutePath: '/var/uploads/ws-1/origem.bin',
    });
    readAccessFileMock = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KloelComposerService,
        {
          provide: PlanLimitsService,
          useValue: {
            ensureTokenBudget: jest.fn().mockResolvedValue(undefined),
            trackAiUsage: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: StorageService,
          useValue: {
            upload: uploadMock,
            resolveLocalAccessToken: resolveLocalAccessTokenMock,
            readAccessFile: readAccessFileMock,
          },
        },
        { provide: KLOEL_COMPOSER_E2E_GUARD, useValue: { isEnabled: jest.fn(() => false) } },
      ],
    }).compile();

    service = module.get<KloelComposerService>(KloelComposerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('converts a DOCX read from our signed storage into a persisted .md card payload', async () => {
    readAccessFileMock.mockResolvedValue({ buffer: buildDocxFixture(), mimeType: DOCX_MIME });

    const result = await service.executeComposerCapability({
      capability: 'document_to_markdown',
      message: 'converta esse contrato para markdown',
      workspaceId: 'ws-1',
      metadata: attachmentMetadata('Contrato Final.docx', DOCX_MIME),
    });

    expect(resolveLocalAccessTokenMock).toHaveBeenCalledWith('tok-abc.sig1');
    expect(readAccessFileMock).toHaveBeenCalledWith('uploads/ws-1/origem.bin');
    expect(result.content).toContain('Contrato Final.docx');
    // Zero-leak: the user-visible reply never carries the internal capability id.
    expect(result.content).not.toContain('document_to_markdown');
    expect(result.estimatedTokens).toBe(0);
    expect(result.metadata).toEqual(
      expect.objectContaining({
        capability: 'document_to_markdown',
        convertedDocumentFilename: 'contrato-final.md',
        convertedDocumentUrl: 'https://storage.test/converted/doc.md',
        sourceDocumentName: 'Contrato Final.docx',
        sourceDocumentFormat: 'docx',
        convertedMarkdown: expect.stringContaining('# Contrato de Teste') as unknown,
      }),
    );
    expect(uploadMock).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({
        filename: 'contrato-final.md',
        mimeType: 'text/markdown',
        folder: 'kloel/ws-1/converted-documents',
        workspaceId: 'ws-1',
      }),
    );
  });

  it('converts an HTML attachment and stays honest when storage persistence fails', async () => {
    readAccessFileMock.mockResolvedValue({
      buffer: Buffer.from(HTML_FIXTURE, 'utf-8'),
      mimeType: 'text/html',
    });
    uploadMock.mockRejectedValue(new Error('disk offline'));

    const result = await service.executeComposerCapability({
      capability: 'document_to_markdown',
      message: 'converta a página para markdown',
      workspaceId: 'ws-1',
      metadata: attachmentMetadata('guia.html', 'text/html'),
    });

    expect(result.metadata).toEqual(
      expect.objectContaining({
        sourceDocumentFormat: 'html',
        convertedDocumentFilename: 'guia.md',
        convertedMarkdown: expect.stringContaining('## Seção Principal') as unknown,
      }),
    );
    // Best-effort persistence: the markdown still reaches the user, but no
    // download URL is claimed when the storage write failed.
    expect(result.metadata).not.toHaveProperty('convertedDocumentUrl');
  });

  it('routes a PDF through the pdf-parse seam and normalizes the extracted text', async () => {
    readAccessFileMock.mockResolvedValue({
      buffer: Buffer.from('%PDF-1.4 bytes do anexo', 'latin1'),
      mimeType: 'application/pdf',
    });

    const result = await service.executeComposerCapability({
      capability: 'document_to_markdown',
      message: 'extraia o texto do relatório em markdown',
      workspaceId: 'ws-1',
      metadata: attachmentMetadata('relatorio.pdf', 'application/pdf'),
    });

    expect(result.metadata).toEqual(
      expect.objectContaining({
        sourceDocumentFormat: 'pdf',
        convertedDocumentFilename: 'relatorio.md',
        // plainTextToMarkdown over the engine output: CRLF unified, trailing
        // spaces stripped, blank-line runs collapsed.
        convertedMarkdown: 'Relatorio PDF real\n\n-- pagina 1 de 1 --',
      }),
    );
  });

  it('rejects with the attachment-missing error when nothing convertible is attached', async () => {
    const input = {
      capability: 'document_to_markdown' as const,
      message: 'converta para markdown',
      workspaceId: 'ws-1',
      metadata: {
        attachments: [{ name: 'foto.png', mimeType: 'image/png', kind: 'image', url: signedUrl }],
      },
    };
    await expect(service.executeComposerCapability(input)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.executeComposerCapability(input)).rejects.toThrow(
      ERR_DOCUMENT_ATTACHMENT_MISSING,
    );
    expect(readAccessFileMock).not.toHaveBeenCalled();
  });

  it('maps a whitespace-only text document to the honest no-text error', async () => {
    readAccessFileMock.mockResolvedValue({
      buffer: Buffer.from('   \r\n\r\n   ', 'utf-8'),
      mimeType: 'text/plain',
    });

    await expect(
      service.executeComposerCapability({
        capability: 'document_to_markdown',
        message: 'converta as notas para markdown',
        workspaceId: 'ws-1',
        metadata: attachmentMetadata('notas.txt', 'text/plain'),
      }),
    ).rejects.toThrow(ERR_DOCUMENT_NO_TEXT);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('maps an unreadable DOCX container to the honest conversion-failed error', async () => {
    readAccessFileMock.mockResolvedValue({
      buffer: Buffer.from('definitivamente não é um zip válido'.repeat(2), 'utf-8'),
      mimeType: DOCX_MIME,
    });

    await expect(
      service.executeComposerCapability({
        capability: 'document_to_markdown',
        message: 'converta o contrato para markdown',
        workspaceId: 'ws-1',
        metadata: attachmentMetadata('contrato.docx', DOCX_MIME),
      }),
    ).rejects.toThrow(ERR_DOCUMENT_CONVERSION_FAILED);
  });
});
