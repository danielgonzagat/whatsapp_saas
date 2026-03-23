import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
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

interface UploadedFileType {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

function looksLikeUtf8Text(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  if (!sample.length) return false;

  const decoded = sample.toString('utf8');
  if (decoded.includes('\uFFFD')) {
    return false;
  }

  let suspiciousControlBytes = 0;
  for (const byte of sample) {
    const isAllowedControl = byte === 9 || byte === 10 || byte === 13;
    const isPrintable = byte >= 32 && byte <= 126;
    const isExtended = byte >= 128;
    if (!isAllowedControl && !isPrintable && !isExtended) {
      suspiciousControlBytes += 1;
    }
  }

  return suspiciousControlBytes / sample.length < 0.02;
}

function detectMimeType(file: UploadedFileType): string | null {
  const buffer = file.buffer;
  const name = file.originalname.toLowerCase();

  if (
    buffer.length >= 4 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return 'application/pdf';
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return 'image/jpeg';
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  if (
    name.endsWith('.docx') &&
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  ) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }

  if (
    name.endsWith('.doc') &&
    buffer.length >= 8 &&
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0 &&
    buffer[4] === 0xa1 &&
    buffer[5] === 0xb1 &&
    buffer[6] === 0x1a &&
    buffer[7] === 0xe1
  ) {
    return 'application/msword';
  }

  if (
    (name.endsWith('.txt') || String(file.mimetype || '').includes('text')) &&
    looksLikeUtf8Text(buffer)
  ) {
    return 'text/plain';
  }

  return null;
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
    @UploadedFile() file: UploadedFileType,
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

    const detectedMime = detectMimeType(file);
    if (!detectedMime) {
      throw new BadRequestException(
        'Tipo de arquivo não permitido ou assinatura inválida.',
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
        const detectedMime = detectMimeType(file);
        if (!detectedMime) {
          throw new BadRequestException(
            'Tipo de arquivo não permitido ou assinatura inválida.',
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
        },
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
