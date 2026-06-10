/**
 * Deps-injected document→markdown conversion flow for the composer
 * `document_to_markdown` capability.
 *
 * Extracted verbatim from `KloelComposerService` (architecture size
 * guardrail): the functions receive the service collaborators
 * (`storageService`, `logger`, `formatUnknownError`) as an explicit deps
 * object — same observable behavior, framework-free and unit-testable. The
 * pure format converters live in `kloel-composer.document.helpers.ts`.
 *
 * @see backend/src/kloel/kloel-composer.service.ts
 */
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { StructuredLogger } from '../logging/structured-logger';
import type { StorageService } from '../common/storage/storage.service';
import { getTraceHeaders } from '../common/trace-headers';
import { validateNoInternalAccess } from '../common/utils/url-validator';
import { extractComposerMetadata } from './kloel.service.composer.helpers';
import {
  buildConvertedMarkdownFilename,
  convertedMarkdownStorageFolder,
  docxBufferToMarkdown,
  htmlToMarkdown,
  pickConvertibleDocumentAttachment,
  plainTextToMarkdown,
  resolveConvertibleDocumentFormat,
  type ConvertibleDocumentFormat,
} from './kloel-composer.document.helpers';
import {
  DOCUMENT_DOWNLOAD_TIMEOUT_MS,
  ERR_DOCUMENT_ATTACHMENT_MISSING,
  ERR_DOCUMENT_CONVERSION_FAILED,
  ERR_DOCUMENT_DOWNLOAD_FAILED,
  ERR_DOCUMENT_NO_TEXT,
  composeAbortSignal,
  type CapabilityExecutionResult,
} from './kloel-composer.service.helpers';

/** Collaborators the conversion flow borrows from `KloelComposerService`. */
export interface DocumentConversionDeps {
  storageService: StorageService;
  logger: StructuredLogger;
  formatUnknownError: (error: unknown) => string;
}

/** Path shape of our own signed storage access URLs. */
const STORAGE_ACCESS_PATH_RE = /^\/storage\/(?:local|access)\/([^/]+)$/;

/**
 * Resolve a signed storage access URL (`/storage/local/<token>` or
 * `/storage/access/<token>`) back to its storage-relative path, or null
 * when the URL is not one of our own signed storage URLs.
 */
export function resolveStorageAccessRelativePath(
  deps: DocumentConversionDeps,
  sourceUrl: string,
): string | null {
  let pathname = '';
  try {
    pathname = new URL(String(sourceUrl || '').trim()).pathname;
  } catch (error: unknown) {
    deps.logger.warn(`URL de documento anexado inválida: ${deps.formatUnknownError(error)}`);
    return null;
  }
  const token = STORAGE_ACCESS_PATH_RE.exec(pathname)?.[1];
  if (!token) {
    return null;
  }
  try {
    return deps.storageService.resolveLocalAccessToken(decodeURIComponent(token)).relativePath;
  } catch (error: unknown) {
    deps.logger.warn(
      `Token de acesso ao storage do documento anexado inválido: ${deps.formatUnknownError(error)}`,
    );
    return null;
  }
}

/**
 * Load the attached document bytes: prefer reading our own storage directly
 * (signed access URL), falling back to an SSRF-validated download for
 * public storage/CDN URLs.
 */
export async function resolveAttachedDocumentBuffer(
  deps: DocumentConversionDeps,
  sourceUrl: string,
  signal: AbortSignal | undefined,
): Promise<Buffer> {
  const relativePath = resolveStorageAccessRelativePath(deps, sourceUrl);
  if (relativePath) {
    const stored = await deps.storageService.readAccessFile(relativePath);
    if (stored) {
      return stored.buffer;
    }
    throw new InternalServerErrorException(ERR_DOCUMENT_DOWNLOAD_FAILED);
  }
  validateNoInternalAccess(sourceUrl);
  try {
    const timeoutSignal = AbortSignal.timeout(DOCUMENT_DOWNLOAD_TIMEOUT_MS);
    const response = await fetch(sourceUrl, {
      headers: getTraceHeaders(),
      signal: composeAbortSignal(signal, timeoutSignal),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
  } catch (error: unknown) {
    deps.logger.warn(`Falha ao baixar documento anexado: ${deps.formatUnknownError(error)}`);
    throw new InternalServerErrorException(ERR_DOCUMENT_DOWNLOAD_FAILED);
  }
}

/** Convert a PDF buffer to markdown via the in-repo `pdf-parse` engine. */
export async function convertPdfBufferToMarkdown(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  try {
    const parsed = await parser.getText();
    return plainTextToMarkdown(String(parsed.text || ''));
  } finally {
    await parser.destroy();
  }
}

/** Convert the attached document bytes into markdown for its format. */
export async function convertDocumentBufferToMarkdown(
  deps: DocumentConversionDeps,
  format: ConvertibleDocumentFormat,
  buffer: Buffer,
): Promise<string> {
  if (format === 'html') {
    return htmlToMarkdown(buffer.toString('utf-8'));
  }
  if (format === 'text') {
    return plainTextToMarkdown(buffer.toString('utf-8'));
  }
  try {
    if (format === 'pdf') {
      return await convertPdfBufferToMarkdown(buffer);
    }
    const markdown = docxBufferToMarkdown(buffer);
    if (markdown === null) {
      throw new Error('DOCX container ilegível');
    }
    return markdown;
  } catch (error: unknown) {
    deps.logger.warn(
      `Falha ao converter documento anexado (${format}): ${deps.formatUnknownError(error)}`,
    );
    throw new InternalServerErrorException(ERR_DOCUMENT_CONVERSION_FAILED);
  }
}

/**
 * Silent document→markdown capability: load the attached document, convert
 * it locally (no LLM call, no provider spend) and persist the resulting
 * `.md` so the chat can deliver a downloadable file card. The full markdown
 * travels in `metadata.convertedMarkdown` for the file card and is redacted
 * from the public trace by the thinker branch.
 */
export async function convertAttachedDocumentToMarkdown(
  deps: DocumentConversionDeps,
  input: {
    metadata?: Prisma.InputJsonValue | Prisma.JsonValue | null;
    workspaceId?: string;
    signal?: AbortSignal;
  },
): Promise<CapabilityExecutionResult> {
  const { metadata, workspaceId, signal } = input;
  const attachment = pickConvertibleDocumentAttachment(
    extractComposerMetadata(metadata).attachments,
  );
  const sourceUrl = typeof attachment?.url === 'string' ? attachment.url.trim() : '';
  if (!attachment || !sourceUrl) {
    throw new BadRequestException(ERR_DOCUMENT_ATTACHMENT_MISSING);
  }
  const format = resolveConvertibleDocumentFormat(attachment.name, attachment.mimeType);
  if (!format) {
    throw new BadRequestException(ERR_DOCUMENT_ATTACHMENT_MISSING);
  }
  const buffer = await resolveAttachedDocumentBuffer(deps, sourceUrl, signal);
  const markdown = await convertDocumentBufferToMarkdown(deps, format, buffer);
  if (!markdown.trim()) {
    throw new InternalServerErrorException(ERR_DOCUMENT_NO_TEXT);
  }
  const convertedDocumentFilename = buildConvertedMarkdownFilename(attachment.name);
  let convertedDocumentUrl: string | null = null;
  try {
    const stored = await deps.storageService.upload(Buffer.from(markdown, 'utf-8'), {
      filename: convertedDocumentFilename,
      mimeType: 'text/markdown',
      folder: convertedMarkdownStorageFolder(workspaceId),
      ...(workspaceId !== undefined ? { workspaceId } : {}),
    });
    convertedDocumentUrl = stored.url;
  } catch (error: unknown) {
    // Best-effort persistence: the markdown still reaches the user through
    // the file card content even when the storage write fails.
    deps.logger.warn(
      `Falha ao persistir markdown convertido no storage: ${deps.formatUnknownError(error)}`,
    );
  }
  const sourceDocumentName = String(attachment.name || '').trim() || convertedDocumentFilename;
  return {
    content: `Documento "${sourceDocumentName}" convertido para markdown e pronto para download.`,
    metadata: {
      capability: 'document_to_markdown',
      convertedMarkdown: markdown,
      convertedDocumentFilename,
      ...(convertedDocumentUrl ? { convertedDocumentUrl } : {}),
      sourceDocumentName,
      sourceDocumentFormat: format,
    },
    estimatedTokens: 0,
  };
}
