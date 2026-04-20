import { createReadStream, existsSync } from 'node:fs';
import { basename } from 'node:path';
import { Controller, ForbiddenException, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { Public } from '../../auth/public.decorator';
import { StorageService } from './storage.service';

/** Storage controller. */
@Controller('storage')
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Public()
  @Get('local/:token')
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  async serveSignedLocalFile(@Param('token') token: string, @Res() res: Response) {
    return this.serveSignedFile(token, res);
  }

  @Public()
  @Get('access/:token')
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  async serveSignedAccessFile(@Param('token') token: string, @Res() res: Response) {
    return this.serveSignedFile(token, res);
  }

  private async serveSignedFile(token: string, res: Response) {
    let resolved: ReturnType<StorageService['resolveLocalAccessToken']>;
    try {
      resolved = this.storage.resolveLocalAccessToken(token);
    } catch (error: unknown) {
      const errorInstanceofError =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error');
      if (String(errorInstanceofError?.message || '') === 'expired_storage_token') {
        throw new ForbiddenException('Link de arquivo expirado');
      }
      throw new NotFoundException('Arquivo não encontrado');
    }

    if (!existsSync(resolved.absolutePath)) {
      const remote = await this.storage.readAccessFile(resolved.relativePath);
      if (!remote) {
        throw new NotFoundException('Arquivo não encontrado');
      }

      const fileName = resolved.downloadName || basename(resolved.relativePath);
      res.setHeader('Content-Type', remote.mimeType);
      res.setHeader(
        'Content-Disposition',
        `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      );
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.setHeader('Content-Length', String(remote.buffer.length));
      res.send(remote.buffer);
      return;
    }

    const fileName = resolved.downloadName || basename(resolved.relativePath);
    const mimeType = this.storage.getMimeTypeForPath(resolved.relativePath);

    res.setHeader('Content-Type', mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    res.setHeader('Cache-Control', 'private, max-age=300');

    const stream = createReadStream(resolved.absolutePath);
    stream.pipe(res);
  }
}
