import {
  BadRequestException,
  Controller,
  FileTypeValidator,
  HttpException,
  HttpStatus,
  Logger,
  MaxFileSizeValidator,
  ParseFilePipe,
  Post,
  Req,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  Optional,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { forEachSequential } from '../common/async-sequence';
import { detectUploadedMime } from '../common/file-signature.util';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { StorageService } from '../common/storage/storage.service';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import {
  estimateOpenAiChatQuoteCostCents,
  quoteOpenAiChatActualCostCents,
} from '../wallet/provider-llm-billing';
import { UnknownProviderPricingModelError } from '../wallet/provider-pricing';
import { WalletService } from '../wallet/wallet.service';
import {
  InsufficientWalletBalanceError,
  UsagePriceNotFoundError,
  WalletNotFoundError,
} from '../wallet/wallet.types';
import { MemoryService } from './memory.service';
import {
  PDF_ANALYSIS_SYSTEM_PROMPT,
  PdfProcessorService,
  buildPdfAnalysisPrompt,
} from './pdf-processor.service';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { OpsAlertService } from '../observability/ops-alert.service';
import {
  deleteStoredFileIfNeeded as companionDeleteStored,
  insufficientWalletMessage as companionInsufficientWallet,
  storeUploadedFile as companionStoreFile,
} from './__companions__/upload-helpers';

const JPG_JPEG_PNG_GIF_WEBP_RE = /\.(jpg|jpeg|png|gif|webp|pdf|txt|doc|docx|xls|xlsx)$/i;
const IMAGE___JPEG_PNG_GIF_W_RE = /^(image\/(jpeg|png|gif|webp)|application\/pdf|text\/plain)$/;
const DOC_DOCX_RE = /\.(doc|docx)$/i;

interface UploadedFileType {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const ALLOWED_UPLOAD_MIMES = new Set([
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

function countAnalysisItems(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

/** Upload controller. */
@ApiTags('KLOEL Upload')
@Controller('kloel/upload')
export class UploadController {
  private readonly logger = new Logger(UploadController.name);

  constructor(
    private readonly pdfProcessor: PdfProcessorService,
    private readonly memoryService: MemoryService,
    private readonly storageService: StorageService,
    private readonly prepaidWalletService: WalletService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  private insufficientWalletMessage() {
    return companionInsufficientWallet();
  }

  private async storeUploadedFile(file: UploadedFileType, workspaceId: string) {
    return companionStoreFile(this.storageService, file, workspaceId);
  }

  private async deleteStoredFileIfNeeded(relativePath?: string) {
    return companionDeleteStored(this.storageService, this.logger, this.opsAlert, relativePath);
  }

  private estimatePdfAnalysisQuote(text: string, sourceName: string): bigint | undefined {
    try {
      return estimateOpenAiChatQuoteCostCents({
        model: resolveBackendOpenAIModel('brain'),
        messages: [
          { role: 'system', content: PDF_ANALYSIS_SYSTEM_PROMPT },
          { role: 'user', content: buildPdfAnalysisPrompt(text, sourceName) },
        ],
      });
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'UploadController.buildPdfAnalysisPrompt');
      if (error instanceof UnknownProviderPricingModelError) {
        return undefined;
      }
      throw error;
    }
  }

  private async chargePdfAnalysisIfNeeded(input: {
    workspaceId: string;
    requestId: string;
    sourceName: string;
    textLength: number;
    estimatedCostCents?: bigint;
  }) {
    const billingRail =
      input.estimatedCostCents !== undefined ? 'provider_quote' : 'catalog_fallback';

    try {
      await this.prepaidWalletService.chargeForUsage({
        workspaceId: input.workspaceId,
        operation: 'ai_message',
        ...(input.estimatedCostCents !== undefined
          ? { quotedCostCents: input.estimatedCostCents }
          : { units: 1 }),
        requestId: input.requestId,
        metadata: {
          channel: 'kloel_upload',
          capability: 'pdf_analysis',
          sourceName: input.sourceName,
          textLength: input.textLength,
          billingRail,
        },
      });
      return true;
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'UploadController.chargeForUsage');
      if (error instanceof UsagePriceNotFoundError) {
        return false;
      }
      if (error instanceof InsufficientWalletBalanceError || error instanceof WalletNotFoundError) {
        throw new HttpException(this.insufficientWalletMessage(), HttpStatus.PAYMENT_REQUIRED);
      }
      throw error;
    }
  }

  private async settlePdfAnalysisIfNeeded(input: {
    workspaceId: string;
    requestId: string;
    sourceName: string;
    usage: unknown;
  }) {
    try {
      await this.prepaidWalletService.settleUsageCharge({
        workspaceId: input.workspaceId,
        operation: 'ai_message',
        requestId: input.requestId,
        actualCostCents: quoteOpenAiChatActualCostCents({
          model: resolveBackendOpenAIModel('brain'),
          usage: input.usage as {
            prompt_tokens?: number | null;
            completion_tokens?: number | null;
            prompt_tokens_details?: { cached_tokens?: number | null } | null;
          },
        }),
        reason: 'upload_pdf_provider_usage',
        metadata: {
          channel: 'kloel_upload',
          capability: 'pdf_analysis',
          sourceName: input.sourceName,
        },
      });
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'UploadController.resolveBackendOpenAIModel');
      if (!(error instanceof UnknownProviderPricingModelError)) {
        throw error;
      }
    }
  }

  private async refundPdfAnalysisIfNeeded(
    workspaceId: string,
    requestId: string,
    reason: string,
    sourceName: string,
  ) {
    try {
      await this.prepaidWalletService.refundUsageCharge({
        workspaceId,
        operation: 'ai_message',
        requestId,
        reason,
        metadata: {
          channel: 'kloel_upload',
          capability: 'pdf_analysis',
          sourceName,
        },
      });
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'UploadController.refundUsageCharge');
      this.logger.error(
        `Failed to refund upload pdf_analysis workspace=${workspaceId} request=${requestId}: ${
          error instanceof Error
            ? error instanceof Error
              ? error.message
              : String(error)
            : String(error)
        }`,
      );
    }
  }

  /**
   * Endpoint generico de upload de arquivos
   * Suporta: PDF, TXT, imagens, documentos
   */
  // PULSE_TODO: verify if still needed, no caller detected
  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @ApiOperation({ summary: 'Upload de arquivo para ensinar a IA' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Arquivo para upload (PDF, TXT, imagem)',
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = JPG_JPEG_PNG_GIF_WEBP_RE;
        cb(null, allowed.test(file.originalname));
      },
    }),
  )
  async uploadFile(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }), // 10MB
          new FileTypeValidator({
            fileType: IMAGE___JPEG_PNG_GIF_W_RE,
          }),
        ],
      }),
    )
    file: UploadedFileType,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!file) {
      throw new BadRequestException('Nenhum arquivo enviado');
    }

    const workspaceId = resolveWorkspaceId(req);

    this.logger.log(
      `Upload recebido: ${file.originalname} (${file.mimetype}) - ${file.size} bytes`,
    );

    // Validar tamanho (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException('Arquivo muito grande. Máximo permitido: 10MB');
    }

    const detectedMime = detectUploadedMime(file);
    if (!detectedMime) {
      throw new BadRequestException('Tipo de arquivo não permitido ou assinatura inválida.');
    }
    if (!ALLOWED_UPLOAD_MIMES.has(detectedMime)) {
      throw new BadRequestException(
        `Tipo de arquivo não suportado neste endpoint: ${detectedMime}`,
      );
    }
    file.mimetype = detectedMime;

    // Processar baseado no tipo
    const result = await this.processFile(file, workspaceId);

    return {
      success: true,
      filename: file.originalname,
      size: file.size,
      type: file.mimetype,
      ...result,
    };
  }

  /**
   * Upload de múltiplos arquivos
   */
  @Post('multiple')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @ApiOperation({ summary: 'Upload de múltiplos arquivos' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = JPG_JPEG_PNG_GIF_WEBP_RE;
        cb(null, allowed.test(file.originalname));
      },
    }),
  )
  async uploadMultipleFiles(
    @UploadedFiles() files: UploadedFileType[],
    @Req() req: AuthenticatedRequest,
  ) {
    if (!Array.isArray(files) || files.length === 0) {
      throw new BadRequestException('Nenhum arquivo enviado');
    }

    const workspaceId = resolveWorkspaceId(req);

    const results: Array<Record<string, unknown>> = [];

    await forEachSequential(files, async (file) => {
      if (!file || !Buffer.isBuffer(file.buffer) || typeof file.originalname !== 'string') {
        results.push({
          success: false,
          filename: 'unknown',
          error: 'Arquivo enviado em formato inválido',
        });
        return;
      }
      try {
        const detectedMime = detectUploadedMime(file);
        if (!detectedMime) {
          throw new BadRequestException('Tipo de arquivo não permitido ou assinatura inválida.');
        }
        if (!ALLOWED_UPLOAD_MIMES.has(detectedMime)) {
          throw new BadRequestException(
            `Tipo de arquivo não suportado neste endpoint: ${detectedMime}`,
          );
        }
        file.mimetype = detectedMime;

        const result = await this.processFile(file, workspaceId);
        results.push({
          success: true,
          filename: file.originalname,
          size: file.size,
          type: file.mimetype,
          ...result,
        });
      } catch (error: unknown) {
        void this.opsAlert?.alertOnCriticalError(error, 'UploadController.push');
        results.push({
          success: false,
          filename: file.originalname,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    return {
      total: files.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    };
  }

  private async processFile(file: UploadedFileType, workspaceId: string) {
    const { mimetype, originalname } = file;

    // PDF - extrair texto e processar
    if (mimetype === 'application/pdf') {
      let extractedText = '';
      try {
        const mod = (await import('pdf-parse')) as Record<string, unknown>;
        const pdfParse = (mod.default ?? mod) as (data: Buffer) => Promise<{
          text: string;
          numpages?: number;
        }>;
        const textResult = await pdfParse(file.buffer);
        extractedText = textResult.text;
      } catch (error: unknown) {
        void this.opsAlert?.alertOnCriticalError(error, 'UploadController.pdfParse');
        this.logger.error(
          `Erro ao extrair PDF do upload ${originalname}: ${error instanceof Error ? error.message : String(error)}`,
        );
        throw new BadRequestException(
          'Não foi possível extrair texto do PDF. Verifique se o arquivo é um PDF válido.',
        );
      }

      if (!extractedText || extractedText.trim().length < 10) {
        throw new BadRequestException('O documento não contém texto suficiente para análise.');
      }

      const requestId = `${workspaceId}:${originalname}:${file.size}`;
      const estimatedCostCents = this.estimatePdfAnalysisQuote(extractedText, originalname);
      const usageCharged = await this.chargePdfAnalysisIfNeeded({
        workspaceId,
        requestId,
        sourceName: originalname,
        textLength: extractedText.length,
        estimatedCostCents,
      });

      let stored:
        | {
            url: string;
            path: string;
            size: number;
          }
        | undefined;
      try {
        stored = await this.storeUploadedFile(file, workspaceId);
        const result = await this.pdfProcessor.processTextWithUsage(
          workspaceId,
          extractedText,
          originalname,
        );
        await this.memoryService.saveMemory(
          workspaceId,
          `doc_${Date.now()}`,
          {
            filename: originalname,
            type: 'pdf',
            products: countAnalysisItems(result.analysis.products),
            storagePath: stored.path,
            storageUrl: stored.url,
          },
          'document',
          `Documento PDF processado: ${originalname}`,
        );
        if (estimatedCostCents !== undefined && usageCharged) {
          await this.settlePdfAnalysisIfNeeded({
            workspaceId,
            requestId,
            sourceName: originalname,
            usage: result.usage,
          });
        }

        return {
          processed: true,
          type: 'pdf',
          url: stored.url,
          storagePath: stored.path,
          analysis: {
            products: countAnalysisItems(result.analysis.products),
            hasCompanyInfo: !!result.analysis.companyInfo,
            objections: countAnalysisItems(result.analysis.objections),
          },
        };
      } catch (error: unknown) {
        void this.opsAlert?.alertOnCriticalError(error, 'UploadController.countAnalysisItems');
        await this.deleteStoredFileIfNeeded(stored?.path);
        if (usageCharged) {
          await this.refundPdfAnalysisIfNeeded(
            workspaceId,
            requestId,
            'upload_pdf_provider_exception',
            originalname,
          );
        }
        throw error;
      }
    }

    // Texto - processar direto
    if (mimetype === 'text/plain' || originalname.endsWith('.txt')) {
      const stored = await this.storeUploadedFile(file, workspaceId);
      const text = file.buffer.toString('utf-8');

      await this.memoryService.saveMemory(
        workspaceId,
        `text_${Date.now()}`,
        {
          filename: originalname,
          type: 'text',
          length: text.length,
          storagePath: stored.path,
          storageUrl: stored.url,
        },
        'text',
        text.substring(0, 5000), // Limite para memória
      );

      return {
        processed: true,
        type: 'text',
        url: stored.url,
        storagePath: stored.path,
        charactersExtracted: text.length,
      };
    }

    // Imagem - salvar referência (OCR futuro)
    if (mimetype.startsWith('image/')) {
      const stored = await this.storeUploadedFile(file, workspaceId);
      await this.memoryService.saveMemory(
        workspaceId,
        `img_${Date.now()}`,
        {
          filename: originalname,
          type: 'image',
          size: file.size,
          storagePath: stored.path,
          storageUrl: stored.url,
        },
        'image',
        `Imagem enviada: ${originalname}`,
      );

      return {
        processed: true,
        type: 'image',
        url: stored.url,
        storagePath: stored.path,
        note: 'Imagem armazenada e pronta para uso. Se precisar extrair texto, prossiga pelo fluxo de processamento do workspace.',
      };
    }

    // Documentos Word/outros
    if (
      mimetype.includes('document') ||
      mimetype.includes('msword') ||
      originalname.match(DOC_DOCX_RE)
    ) {
      const stored = await this.storeUploadedFile(file, workspaceId);
      await this.memoryService.saveMemory(
        workspaceId,
        `doc_${Date.now()}`,
        {
          filename: originalname,
          type: 'document',
          size: file.size,
          storagePath: stored.path,
          storageUrl: stored.url,
        },
        'document',
        `Documento enviado: ${originalname}`,
      );

      return {
        processed: true,
        type: 'document',
        url: stored.url,
        storagePath: stored.path,
        note: 'Documento armazenado. Extração de texto será processada.',
      };
    }

    // Tipo não suportado
    throw new BadRequestException(
      `Tipo de arquivo não suportado: ${mimetype}. Use PDF, TXT, imagens ou documentos Word.`,
    );
  }
}
