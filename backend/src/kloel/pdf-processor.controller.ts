import {
  BadRequestException,
  Body,
  Controller,
  FileTypeValidator,
  HttpException,
  HttpStatus,
  Logger,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Optional,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import {
  estimateOpenAiChatQuoteCostCents,
  quoteOpenAiChatActualCostCents,
} from '../wallet/provider-llm-billing';
import { UnknownProviderPricingModelError } from '../wallet/provider-pricing';
import { WalletService } from '../wallet/wallet.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import {
  InsufficientWalletBalanceError,
  UsagePriceNotFoundError,
  WalletNotFoundError,
} from '../wallet/wallet.types';
import {
  PDF_ANALYSIS_SYSTEM_PROMPT,
  PdfProcessorService,
  buildPdfAnalysisPrompt,
} from './pdf-processor.service';

const PDF_TXT_RE = /\.(pdf|txt)$/i;
const APPLICATION__PDF_OR_TEXT_RE = /^(application\/pdf|text\/plain)$/;

function countAnalysisItems(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

/** Pdf processor controller. */
@ApiTags('KLOEL PDF Processor')
@Controller('kloel/pdf')
@UseGuards(JwtAuthGuard)
export class PdfProcessorController {
  private readonly logger = new Logger(PdfProcessorController.name);

  constructor(
    private readonly pdfProcessor: PdfProcessorService,
    private readonly prepaidWalletService: WalletService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  private insufficientWalletMessage() {
    return 'Saldo insuficiente na wallet prepaid para analisar documentos. Recarregue via PIX ou aguarde a auto-recarga antes de tentar novamente.';
  }

  private estimatePdfAnalysisQuote(text: string, sourceName: string): bigint | undefined {
    const model = resolveBackendOpenAIModel('brain');
    try {
      return estimateOpenAiChatQuoteCostCents({
        model,
        messages: [
          { role: 'system', content: PDF_ANALYSIS_SYSTEM_PROMPT },
          { role: 'user', content: buildPdfAnalysisPrompt(text, sourceName) },
        ],
      });
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(
        error,
        'PdfProcessorController.buildPdfAnalysisPrompt',
      );
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
          channel: 'kloel_pdf',
          capability: 'pdf_analysis',
          sourceName: input.sourceName,
          textLength: input.textLength,
          billingRail,
        },
      });
      return true;
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'PdfProcessorController.chargeForUsage');
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
        reason: 'pdf_analysis_provider_usage',
        metadata: {
          channel: 'kloel_pdf',
          capability: 'pdf_analysis',
          sourceName: input.sourceName,
        },
      });
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(
        error,
        'PdfProcessorController.resolveBackendOpenAIModel',
      );
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
          channel: 'kloel_pdf',
          capability: 'pdf_analysis',
          sourceName,
        },
      });
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'PdfProcessorController.refundUsageCharge');
      this.logger.error(
        `Failed to refund pdf_analysis workspace=${workspaceId} request=${requestId}: ${
          error instanceof Error
            ? error instanceof Error
              ? error.message
              : String(error)
            : String(error)
        }`,
      );
    }
  }

  /** Upload pdf. */
  @Post(':workspaceId/upload')
  @ApiOperation({ summary: 'Upload e processa PDF' })
  @ApiParam({ name: 'workspaceId', description: 'ID do workspace' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Arquivo PDF ou TXT para upload',
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 20 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = PDF_TXT_RE;
        cb(null, allowed.test(file.originalname));
      },
    }),
  )
  async uploadPdf(
    @Param('workspaceId') workspaceId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 20 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: APPLICATION__PDF_OR_TEXT_RE }),
        ],
      }),
    )
    file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
  ) {
    if (!file) {
      throw new BadRequestException('Nenhum arquivo enviado');
    }

    this.logger.log(`Processando PDF: ${file.originalname}`);

    let text: string;

    if (file.mimetype === 'application/pdf') {
      try {
        const mod = (await import('pdf-parse')) as Record<string, unknown>;
        const pdfParse = (mod.default ?? mod) as (data: Buffer) => Promise<{
          text: string;
          numpages?: number;
        }>;
        const textResult = await pdfParse(file.buffer);
        text = textResult.text;
        this.logger.log(
          `PDF extraído: ${textResult.numpages || 0} páginas, ${text.length} caracteres`,
        );
      } catch (error: unknown) {
        void this.opsAlert?.alertOnCriticalError(error, 'PdfProcessorController.uploadPdf');
        this.logger.error(
          `Erro ao extrair PDF: ${error instanceof Error ? error.message : String(error)}`,
        );
        throw new BadRequestException(
          'Não foi possível extrair texto do PDF. Verifique se o arquivo é um PDF válido.',
        );
      }
    } else if (file.mimetype === 'text/plain' || file.originalname.endsWith('.txt')) {
      text = file.buffer.toString('utf-8');
    } else {
      throw new BadRequestException(
        `Tipo de arquivo não suportado: ${file.mimetype}. Use PDF ou TXT.`,
      );
    }

    if (!text || text.trim().length < 10) {
      throw new BadRequestException('O documento não contém texto suficiente para análise.');
    }

    const requestId = `${workspaceId}:${file.originalname}:${file.size}`;
    const estimatedCostCents = this.estimatePdfAnalysisQuote(text, file.originalname);
    const usageCharged = await this.chargePdfAnalysisIfNeeded({
      workspaceId,
      requestId,
      sourceName: file.originalname,
      textLength: text.length,
      estimatedCostCents,
    });

    try {
      const result = await this.pdfProcessor.processTextWithUsage(
        workspaceId,
        text,
        file.originalname,
      );
      if (estimatedCostCents !== undefined && usageCharged) {
        await this.settlePdfAnalysisIfNeeded({
          workspaceId,
          requestId,
          sourceName: file.originalname,
          usage: result.usage,
        });
      }

      return {
        status: 'processed',
        filename: file.originalname,
        analysis: {
          products: countAnalysisItems(result.analysis.products),
          hasCompanyInfo: !!result.analysis.companyInfo,
          hasSalesScript: !!result.analysis.salesScript,
          objections: countAnalysisItems(result.analysis.objections),
        },
        details: result.analysis,
      };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'PdfProcessorController.countAnalysisItems');
      if (usageCharged) {
        await this.refundPdfAnalysisIfNeeded(
          workspaceId,
          requestId,
          'pdf_analysis_provider_exception',
          file.originalname,
        );
      }
      throw error;
    }
  }

  /** Process text. */
  @Post(':workspaceId/text')
  @ApiOperation({ summary: 'Processa texto direto' })
  @ApiParam({ name: 'workspaceId', description: 'ID do workspace' })
  async processText(
    @Param('workspaceId') workspaceId: string,
    @Body() body: { text: string; sourceName: string },
  ) {
    if (!body.text || !body.sourceName) {
      throw new BadRequestException('Texto e sourceName são obrigatórios');
    }

    const requestId = `${workspaceId}:${body.sourceName}:${body.text.length}`;
    const estimatedCostCents = this.estimatePdfAnalysisQuote(body.text, body.sourceName);
    const usageCharged = await this.chargePdfAnalysisIfNeeded({
      workspaceId,
      requestId,
      sourceName: body.sourceName,
      textLength: body.text.length,
      estimatedCostCents,
    });

    try {
      const result = await this.pdfProcessor.processTextWithUsage(
        workspaceId,
        body.text,
        body.sourceName,
      );
      if (estimatedCostCents !== undefined && usageCharged) {
        await this.settlePdfAnalysisIfNeeded({
          workspaceId,
          requestId,
          sourceName: body.sourceName,
          usage: result.usage,
        });
      }

      return {
        status: 'processed',
        sourceName: body.sourceName,
        textLength: body.text.length,
        analysis: {
          products: countAnalysisItems(result.analysis.products),
          hasCompanyInfo: !!result.analysis.companyInfo,
          objections: countAnalysisItems(result.analysis.objections),
        },
        details: result.analysis,
      };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'PdfProcessorController.countAnalysisItems');
      if (usageCharged) {
        await this.refundPdfAnalysisIfNeeded(
          workspaceId,
          requestId,
          'pdf_analysis_provider_exception',
          body.sourceName,
        );
      }
      throw error;
    }
  }
}
