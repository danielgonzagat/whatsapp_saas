import { BadRequestException, Logger } from '@nestjs/common';
import { StorageService } from '../common/storage/storage.service';
import { OpsAlertService } from '../observability/ops-alert.service';

interface UploadedFileType {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export const ALLOWED_UPLOAD_MIMES = new Set([
  'application/pdf',
  'text/plain',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

export const UPLOAD_FILENAME_RE = /\.(jpg|jpeg|png|gif|webp|pdf|txt|doc|docx|xls|xlsx)$/i;
export const WORD_DOCUMENT_FILENAME_RE = /\.(doc|docx)$/i;

/** Memory preview cap for plain text uploads. */
export const MEMORY_TEXT_PREVIEW_LIMIT = 5000;

/** Count array items in an unknown analysis payload field. Non-arrays return 0. */
export function countAnalysisItems(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

/** True when a file is a Word document by mime or by filename suffix. */
export function isWordDocumentLike(mimetype: string, originalname: string): boolean {
  return (
    mimetype.includes('document') ||
    mimetype.includes('msword') ||
    WORD_DOCUMENT_FILENAME_RE.test(originalname)
  );
}

export function insufficientWalletMessage() {
  return 'Saldo insuficiente na wallet prepaid para analisar documentos. Recarregue via PIX ou aguarde a auto-recarga antes de tentar novamente.';
}

/**
 * Extract text from a PDF buffer via `pdf-parse`. Throws `BadRequestException`
 * with the original UX message when the parser fails or the document holds
 * fewer than 10 trimmed characters. The `onParserError` hook lets callers
 * route the underlying failure into observability without leaking it to the
 * client.
 */
export async function extractPdfText(
  buffer: Buffer,
  originalname: string,
  logger: Logger,
  onParserError?: (error: unknown) => void,
): Promise<string> {
  let extractedText = '';
  try {
    const mod = (await import('pdf-parse')) as Record<string, unknown>;
    const pdfParse = (mod.default ?? mod) as (data: Buffer) => Promise<{
      text: string;
      numpages?: number;
    }>;
    const textResult = await pdfParse(buffer);
    extractedText = textResult.text;
  } catch (error: unknown) {
    onParserError?.(error);
    logger.error(
      `Erro ao extrair PDF do upload ${originalname}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    throw new BadRequestException(
      'Não foi possível extrair texto do PDF. Verifique se o arquivo é um PDF válido.',
    );
  }

  if (!extractedText || extractedText.trim().length < 10) {
    throw new BadRequestException('O documento não contém texto suficiente para análise.');
  }

  return extractedText;
}

export async function storeUploadedFile(
  storageService: StorageService,
  file: UploadedFileType,
  workspaceId: string,
) {
  return storageService.upload(file.buffer, {
    filename: `${Date.now()}_${file.originalname}`,
    mimeType: file.mimetype,
    folder: `uploads/${workspaceId}`,
    workspaceId,
  });
}

export async function deleteStoredFileIfNeeded(
  storageService: StorageService,
  logger: Logger,
  opsAlert: OpsAlertService | undefined,
  relativePath?: string,
) {
  if (!relativePath) {
    return;
  }

  try {
    await storageService.delete(relativePath);
  } catch (error: unknown) {
    void opsAlert?.alertOnCriticalError(error, 'UploadController.delete');
    logger.error(
      `Falha ao remover upload parcial ${relativePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
