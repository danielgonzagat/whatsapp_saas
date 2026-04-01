import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  BadRequestException,
  Logger,
  UseGuards,
  Req,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { PdfProcessorService } from './pdf-processor.service';
import { MemoryService } from './memory.service';
import { StorageService } from '../common/storage/storage.service';
import {
  detectUploadedMime,
  type UploadedFileLike,
} from '../common/file-signature.util';

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

@ApiTags('KLOEL Upload')
@Controller('kloel/upload')
export class UploadController {
  private readonly logger = new Logger(UploadController.name);

  constructor(
    private readonly pdfProcessor: PdfProcessorService,
    private readonly memoryService: MemoryService,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Endpoint genérico de upload de arquivos
   * Suporta: PDF, TXT, imagens, documentos
   */
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
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }), // 10MB
          new FileTypeValidator({ fileType: /^(image\/(jpeg|png|gif|webp)|application\/pdf|text\/plain)$/ }),
        ],
      }),
    )
    file: UploadedFileType,
    @Req() req: any,
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
      throw new BadRequestException(
        'Arquivo muito grande. Máximo permitido: 10MB',
      );
    }

    const detectedMime = detectUploadedMime(file as UploadedFileLike);
    if (!detectedMime) {
      throw new BadRequestException(
        'Tipo de arquivo não permitido ou assinatura inválida.',
      );
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
  @UseInterceptors(FilesInterceptor('files', 10))
  async uploadMultipleFiles(
    @UploadedFiles() files: UploadedFileType[],
    @Req() req: any,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Nenhum arquivo enviado');
    }

    const workspaceId = resolveWorkspaceId(req);

    const results = [];

    for (const file of files) {
      try {
        const detectedMime = detectUploadedMime(file as UploadedFileLike);
        if (!detectedMime) {
          throw new BadRequestException(
            'Tipo de arquivo não permitido ou assinatura inválida.',
          );
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
      } catch (error) {
        results.push({
          success: false,
          filename: file.originalname,
          error: error.message,
        });
      }
    }

    return {
      total: files.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    };
  }

  private async processFile(file: UploadedFileType, workspaceId: string) {
    const { mimetype, originalname } = file;

    // Store every uploaded file in StorageService (R2 or local)
    const stored = await this.storageService.upload(file.buffer, {
      filename: `${Date.now()}_${originalname}`,
      mimeType: mimetype,
      folder: `uploads/${workspaceId}`,
      workspaceId,
    });

    // PDF - extrair texto e processar
    if (mimetype === 'application/pdf') {
      const analysis = await this.pdfProcessor.processText(
        workspaceId,
        '', // O pdf-processor vai extrair do buffer
        originalname,
      );

      // Salvar na memória
      await this.memoryService.saveMemory(
        workspaceId,
        `doc_${Date.now()}`,
        {
          filename: originalname,
          type: 'pdf',
          products: analysis.products?.length || 0,
          storagePath: stored.path,
          storageUrl: stored.url,
        },
        'document',
        `Documento PDF processado: ${originalname}`,
      );

      return {
        processed: true,
        type: 'pdf',
        url: stored.url,
        storagePath: stored.path,
        analysis: {
          products: analysis.products?.length || 0,
          hasCompanyInfo: !!analysis.companyInfo,
          objections: analysis.objections?.length || 0,
        },
      };
    }

    // Texto - processar direto
    if (mimetype === 'text/plain' || originalname.endsWith('.txt')) {
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
        note: 'Imagem armazenada. OCR será implementado em breve.',
      };
    }

    // Documentos Word/outros
    if (
      mimetype.includes('document') ||
      mimetype.includes('msword') ||
      originalname.match(/\.(doc|docx)$/i)
    ) {
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
