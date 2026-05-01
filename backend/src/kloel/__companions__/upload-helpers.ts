import { StorageService } from '../../common/storage/storage.service';
import { OpsAlertService } from '../../observability/ops-alert.service';
import type { Logger } from '@nestjs/common';

interface UploadedFileType {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export function insufficientWalletMessage() {
  return 'Saldo insuficiente na wallet prepaid para analisar documentos. Recarregue via PIX ou aguarde a auto-recarga antes de tentar novamente.';
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
