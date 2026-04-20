import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  FileTypeValidator,
  Get,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { detectUploadedMime } from '../common/file-signature.util';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { GenerateVideoDto } from './dto/generate-video.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { MediaService } from './media.service';

interface UploadedFileType {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const JPG_JPEG_PNG_GIF_WEBP_RE = /\.(jpg|jpeg|png|gif|webp|pdf|doc|docx|txt|csv|json|xls|xlsx)$/i;
const APPLICATION__PDF_TEXT_RE =
  /^(application\/pdf|text\/plain|text\/csv|application\/json|image\/(jpeg|png|gif|webp))$/;

const ALLOWED_DOCUMENT_MIMES = new Set([
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

/** Media controller. */
@Controller('media')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('video')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async generateVideo(@Req() req: AuthenticatedRequest, @Body() body: GenerateVideoDto) {
    const { workspaceId, ...data } = body;
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.mediaService.createVideoJob(effectiveWorkspaceId, data);
  }

  @Get('job/:id')
  async getStatus(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const workspaceId = resolveWorkspaceId(req);
    return this.mediaService.getJobStatus(id, workspaceId);
  }

  // ============ DOCUMENTOS / CATÁLOGOS ============

  /**
   * Upload de documento/catálogo
   */
  @Post('documents/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        const allowed = JPG_JPEG_PNG_GIF_WEBP_RE;
        cb(null, allowed.test(file.originalname));
      },
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  async uploadDocument(
    @Req() req: AuthenticatedRequest,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 20 * 1024 * 1024 }), // 20MB
          new FileTypeValidator({
            fileType: APPLICATION__PDF_TEXT_RE,
          }),
        ],
      }),
    )
    file: UploadedFileType,
    @Body() body: UploadDocumentDto,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('Arquivo inválido para upload');
    }

    const detectedMime = detectUploadedMime(file);
    if (!detectedMime) {
      throw new BadRequestException('Tipo de arquivo não permitido ou assinatura inválida.');
    }
    if (!ALLOWED_DOCUMENT_MIMES.has(detectedMime)) {
      throw new BadRequestException(
        `Tipo de arquivo não suportado para documentos: ${detectedMime}`,
      );
    }
    file.mimetype = detectedMime;

    const workspaceId = resolveWorkspaceId(req, body?.workspaceId);
    return this.mediaService.uploadDocument(workspaceId, file, {
      name: body.name,
      description: body.description,
      category: body.category,
    });
  }

  /**
   * Lista documentos do workspace
   */
  @Get('documents')
  async listDocuments(@Req() req: AuthenticatedRequest, @Query('category') category?: string) {
    const workspaceId = resolveWorkspaceId(req);
    return this.mediaService.listDocuments(workspaceId, category);
  }

  @Get('documents/:idOrName/file')
  async getDocumentFile(
    @Req() req: AuthenticatedRequest,
    @Param('idOrName') idOrName: string,
    @Res() res: Response,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    const file = await this.mediaService.getDocumentFile(workspaceId, idOrName);

    res.setHeader('Content-Type', file.mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    );
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(file.buffer);
  }

  /**
   * Busca documento por ID ou nome
   */
  @Get('documents/:idOrName')
  async getDocument(@Req() req: AuthenticatedRequest, @Param('idOrName') idOrName: string) {
    const workspaceId = resolveWorkspaceId(req);
    return this.mediaService.getDocument(workspaceId, idOrName);
  }

  /**
   * Remove documento
   */
  @Delete('documents/:id')
  async deleteDocument(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const workspaceId = resolveWorkspaceId(req);
    return this.mediaService.deleteDocument(workspaceId, id);
  }
}
