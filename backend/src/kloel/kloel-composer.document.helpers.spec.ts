/**
 * Pure-helper coverage for the document→markdown converter. The
 * KloelComposerService executor suite lives in
 * `kloel-composer.document.helpers.part2.spec.ts`; shared code-built
 * fixtures live in `kloel-composer.document.helpers.fixtures.ts`.
 */
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
import {
  DOCX_MIME,
  DOCX_XML,
  HTML_FIXTURE,
  buildDocxFixture,
  buildZipFixture,
} from './kloel-composer.document.helpers.fixtures';

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
