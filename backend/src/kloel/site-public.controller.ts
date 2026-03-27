import { Controller, Get, Logger, Param, Res, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../auth/public.decorator';

@Controller('s')
export class SitePublicController {
  private readonly logger = new Logger(SitePublicController.name);
  constructor(private readonly prisma: PrismaService) {}

  // GET /s/:slug — serve published site HTML (public, no auth)
  @Public()
  @Get(':slug')
  async serveSite(@Param('slug') slug: string, @Res() res: Response) {
    const site = await this.prisma.kloelSite.findFirst({
      where: { slug, published: true },
    });

    if (!site) {
      return res.status(HttpStatus.NOT_FOUND).send('<html><body style="background:#0A0A0C;color:#E0DDD8;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh"><h1>Pagina nao encontrada</h1></body></html>');
    }

    // Increment visits
    await this.prisma.kloelSite.update({
      where: { id: site.id },
      data: { visits: { increment: 1 } },
    }).catch((err) => this.logger.error('Failed to increment site visits', err.message));

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(site.htmlContent);
  }
}
