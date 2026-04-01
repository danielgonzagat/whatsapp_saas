import {
  BadRequestException,
  Controller,
  Post,
  Body,
  Get,
  Param,
  Req,
  Delete,
  UseInterceptors,
  UploadedFile,
  Query,
  Res,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MediaService } from './media.service';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { detectUploadedMime } from '../common/file-signature.util';
import { Response } from 'express';
import { GenerateVideoDto } from './dto/generate-video.dto';

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

@Controller('media')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('video')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async generateVideo(@Req() req: any, @Body() body: GenerateVideoDto) {
    const { workspaceId, ...data } = body;
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.mediaService.createVideoJob(effectiveWorkspaceId, data);
  }

  @Get('job/:id')
  async getStatus(@Req() req: any, @Param('id') id: string) {
    const workspaceId = resolveWorkspaceId(req);
    return this.mediaService.getJobStatus(id, workspaceId);
  }

  // ============ DOCUMENTOS / CATÁLOGOS ============

  /**
   * Upload de documento/catálogo
   */
  @Post('documents/upload')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async uploadDocument(
    @Req() req: any,
    @UploadedFile() file: any,
    @Body() body: { name?: string; description?: string; category?: string },
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('Arquivo inválido para upload');
    }

    const detectedMime = detectUploadedMime(file);
    if (!detectedMime) {
      throw new BadRequestException(
        'Tipo de arquivo não permitido ou assinatura inválida.',
      );
    }
    if (!ALLOWED_DOCUMENT_MIMES.has(detectedMime)) {
      throw new BadRequestException(
        `Tipo de arquivo não suportado para documentos: ${detectedMime}`,
      );
    }
    file.mimetype = detectedMime;

    const workspaceId = resolveWorkspaceId(
      req,
      (body as Record<string, any>)?.workspaceId,
    );
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
  async listDocuments(@Req() req: any, @Query('category') category?: string) {
    const workspaceId = resolveWorkspaceId(req);
    return this.mediaService.listDocuments(workspaceId, category);
  }

  @Get('documents/:idOrName/file')
  async getDocumentFile(
    @Req() req: any,
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
  async getDocument(@Req() req: any, @Param('idOrName') idOrName: string) {
    const workspaceId = resolveWorkspaceId(req);
    return this.mediaService.getDocument(workspaceId, idOrName);
  }

  /**
   * Remove documento
   */
  @Delete('documents/:id')
  async deleteDocument(@Req() req: any, @Param('id') id: string) {
    const workspaceId = resolveWorkspaceId(req);
    return this.mediaService.deleteDocument(workspaceId, id);
  }
}
