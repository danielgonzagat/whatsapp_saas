import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Res,
} from '@nestjs/common';
import { Public } from '../../auth/public.decorator';
import { StorageService } from './storage.service';
import * as fs from 'fs';
import { Response } from 'express';
import { basename } from 'path';

@Controller('storage')
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Public()
  @Get('local/:token')
  async serveSignedLocalFile(
    @Param('token') token: string,
    @Res() res: Response,
  ) {
    let resolved: ReturnType<StorageService['resolveLocalAccessToken']>;
    try {
      resolved = this.storage.resolveLocalAccessToken(token);
    } catch (error: any) {
      if (String(error?.message || '') === 'expired_storage_token') {
        throw new ForbiddenException('Link de arquivo expirado');
      }
      throw new NotFoundException('Arquivo não encontrado');
    }

    if (!fs.existsSync(resolved.absolutePath)) {
      throw new NotFoundException('Arquivo não encontrado');
    }

    const fileName = resolved.downloadName || basename(resolved.relativePath);
    const mimeType = this.storage.getMimeTypeForPath(resolved.relativePath);

    res.setHeader('Content-Type', mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    res.setHeader('Cache-Control', 'private, max-age=300');

    const stream = fs.createReadStream(resolved.absolutePath);
    stream.pipe(res);
  }
}
