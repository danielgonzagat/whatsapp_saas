import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  BadRequestException,
  Logger,
  Headers,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PdfProcessorService } from './pdf-processor.service';
import { MemoryService } from './memory.service';

interface UploadedFileType {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@ApiTags('KLOEL Upload')
@Controller('kloel/upload')
export class UploadController {
  private readonly logger = new Logger(UploadController.name);

  constructor(
    private readonly pdfProcessor: PdfProcessorService,
    private readonly memoryService: MemoryService,
  ) {}

  /**
   * Endpoint genérico de upload de arquivos
   * Suporta: PDF, TXT, imagens, documentos
   */
  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
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
    @UploadedFile() file: UploadedFileType,
    @Headers('x-workspace-id') workspaceId: string,
  ) {
    if (!file) {
      throw new BadRequestException('Nenhum arquivo enviado');
    }

    if (!workspaceId) {
      throw new BadRequestException('Workspace ID é obrigatório');
    }

    this.logger.log(`Upload recebido: ${file.originalname} (${file.mimetype}) - ${file.size} bytes`);

    // Validar tamanho (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException('Arquivo muito grande. Máximo permitido: 10MB');
    }

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
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Upload de múltiplos arquivos' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', 10))
  async uploadMultipleFiles(
    @UploadedFiles() files: UploadedFileType[],
    @Headers('x-workspace-id') workspaceId: string,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Nenhum arquivo enviado');
    }

    if (!workspaceId) {
      throw new BadRequestException('Workspace ID é obrigatório');
    }

    const results = [];

    for (const file of files) {
      try {
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
        { filename: originalname, type: 'pdf', products: analysis.products?.length || 0 },
        'document',
        `Documento PDF processado: ${originalname}`,
      );

      return {
        processed: true,
        type: 'pdf',
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
        { filename: originalname, type: 'text', length: text.length },
        'text',
        text.substring(0, 5000), // Limite para memória
      );

      return {
        processed: true,
        type: 'text',
        charactersExtracted: text.length,
      };
    }

    // Imagem - salvar referência (OCR futuro)
    if (mimetype.startsWith('image/')) {
      // Por agora, apenas registrar na memória
      await this.memoryService.saveMemory(
        workspaceId,
        `img_${Date.now()}`,
        { filename: originalname, type: 'image', size: file.size },
        'image',
        `Imagem enviada: ${originalname}`,
      );

      return {
        processed: true,
        type: 'image',
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
        { filename: originalname, type: 'document', size: file.size },
        'document',
        `Documento enviado: ${originalname}`,
      );

      return {
        processed: true,
        type: 'document',
        note: 'Documento armazenado. Extração de texto será processada.',
      };
    }

    // Tipo não suportado
    throw new BadRequestException(
      `Tipo de arquivo não suportado: ${mimetype}. Use PDF, TXT, imagens ou documentos Word.`,
    );
  }
}
