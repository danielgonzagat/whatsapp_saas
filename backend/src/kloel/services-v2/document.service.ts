import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { StructuredLogger } from '../../logging/structured-logger';
import { PrismaService } from '../../prisma/prisma.service';

export interface DocumentUploadArgs {
  url: string;
  type?: string; // document type label e.g. "RG", "CPF", "CNPJ"
  filename?: string;
  mimeType?: string;
  [key: string]: unknown;
}

/**
 * DocumentService — records document upload metadata for KYC/compliance.
 *
 * domainService alias: DocumentService.upload
 * Workspace isolation: all records scoped to workspaceId.
 *
 * There is no dedicated Document model — records are stored in the
 * FiscalData.documents JSON field (if it exists) or as a MediaJob entry.
 * This service stores a structured reference in workspace.providerSettings
 * under "documents" array (append-only, non-destructive).
 */
@Injectable()
export class DocumentService {
  private readonly logger = StructuredLogger.from(DocumentService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Record a document upload for the workspace. */
  async upload(
    workspaceId: string,
    args: DocumentUploadArgs,
  ): Promise<{ success: boolean; data: unknown }> {
    const url = String(args.url ?? '').trim();
    if (!url) return { success: false, data: null };

    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });

    const current =
      ws?.providerSettings && typeof ws.providerSettings === 'object'
        ? (ws.providerSettings as Record<string, unknown>)
        : {};

    const existingDocs = Array.isArray(current.documents) ? current.documents : [];

    const entry = {
      url,
      type: String(args.type ?? 'document').toUpperCase(),
      filename: args.filename ? String(args.filename) : undefined,
      mimeType: args.mimeType ? String(args.mimeType) : undefined,
      uploadedAt: new Date().toISOString(),
    };

    const updatedDocs = [...(existingDocs as unknown[]), entry];
    const updatedSettings = { ...current, documents: updatedDocs };

    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { providerSettings: updatedSettings as Prisma.InputJsonValue },
    });

    this.logger.log(
      `DocumentService.upload ws=${workspaceId} type=${entry.type} filename=${entry.filename ?? 'n/a'}`,
    );
    return { success: true, data: entry };
  }
}
