import { Controller, Get, HttpStatus, Param, Res } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { Response } from 'express';
import { Public } from '../auth/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { BRAND_COLORS } from '../common/kloel-colors';
import { RouteClass } from '../common/throttler/route-class.decorator';

/** Site public controller. */
@Controller('s')
@RouteClass('public-checkout')
export class SitePublicController {
  private readonly logger = StructuredLogger.from(SitePublicController.name);
  constructor(private readonly prisma: PrismaService) {}

  // GET /s/:slug — serve published site HTML (public, no auth)
  @Public()
  @Get(':slug')
  async serveSite(@Param('slug') slug: string, @Res() res: Response) {
    // @PublicMetric: public site lookup by slug (slug is globally unique)
    const site = await this.prisma.kloelSite.findFirst({
      where: { slug, workspaceId: { not: '' }, published: true },
    });

    if (!site) {
      return res
        .status(HttpStatus.NOT_FOUND)
        .send(
          `<html><body style="background:${BRAND_COLORS.VOID};color:${BRAND_COLORS.SILVER};font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh"><h1>Pagina nao encontrada</h1></body></html>`,
        );
    }

    // Increment visits
    await this.prisma.kloelSite
      .updateMany({
        where: { id: site.id, workspaceId: site.workspaceId },
        data: { visits: { increment: 1 } },
      })
      .catch((err: unknown) =>
        this.logger.error(
          'Failed to increment site visits',
          err instanceof Error ? err.message : String(err),
        ),
      );

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(site.htmlContent);
  }
}
