import { 
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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MediaService } from './media.service';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { v4 as uuid } from 'uuid';

// Configuração do upload
const uploadStorage = diskStorage({
  destination: join(__dirname, '..', '..', '..', 'uploads'),
  filename: (req, file, cb) => {
    const uniqueName = `${uuid()}${extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('video')
  async generateVideo(@Req() req: any, @Body() body: any) {
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
  @UseInterceptors(FileInterceptor('file', { storage: uploadStorage }))
  async uploadDocument(
    @Req() req: any,
    @UploadedFile() file: any,
    @Body() body: { name?: string; description?: string; category?: string },
  ) {
    const workspaceId = resolveWorkspaceId(req, body['workspaceId']);
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
  async listDocuments(
    @Req() req: any,
    @Query('category') category?: string,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    return this.mediaService.listDocuments(workspaceId, category);
  }

  /**
   * Busca documento por ID ou nome
   */
  @Get('documents/:idOrName')
  async getDocument(
    @Req() req: any,
    @Param('idOrName') idOrName: string,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    return this.mediaService.getDocument(workspaceId, idOrName);
  }

  /**
   * Remove documento
   */
  @Delete('documents/:id')
  async deleteDocument(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    return this.mediaService.deleteDocument(workspaceId, id);
  }
}
