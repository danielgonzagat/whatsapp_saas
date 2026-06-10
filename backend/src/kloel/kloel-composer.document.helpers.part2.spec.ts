/**
 * KloelComposerService executor coverage for the document→markdown
 * capability. Split from `kloel-composer.document.helpers.spec.ts` (which
 * keeps the pure-helper suites) to stay under the CI new-file line guardrail;
 * shared code-built fixtures live in
 * `kloel-composer.document.helpers.fixtures.ts`.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { KloelComposerService } from './kloel-composer.service';
import {
  ERR_DOCUMENT_ATTACHMENT_MISSING,
  ERR_DOCUMENT_CONVERSION_FAILED,
  ERR_DOCUMENT_NO_TEXT,
} from './kloel-composer.service.helpers';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { StorageService } from '../common/storage/storage.service';
import { KLOEL_COMPOSER_E2E_GUARD } from './kloel-composer-e2e-guard';
import {
  DOCX_MIME,
  HTML_FIXTURE,
  buildDocxFixture,
} from './kloel-composer.document.helpers.fixtures';

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
