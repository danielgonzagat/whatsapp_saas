import { Controller, Get, Post, Put, Delete, Body, Param, Request } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('marketing')
export class SiteController {
  constructor(private readonly prisma: PrismaService) {}

  // GET /marketing/sites — list sites for workspace
  @Get('sites')
  async listSites(@Request() req: any) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return { sites: [], count: 0 };
    const sites = await this.prisma.kloelSite.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: 'desc' },
    });
    return { sites, count: sites.length };
  }

  // POST /marketing/site/generate — generate site HTML (proxy to AI)
  @Post('site/generate')
  async generateSite(@Request() req: any, @Body() dto: { prompt: string; currentHtml?: string }) {
    // In production: call Claude API with prompt + currentHtml context
    // For now: return null html so frontend uses fallback generator
    return {
      success: true,
      html: null,
      message: 'AI generation endpoint ready. Configure ANTHROPIC_API_KEY for real generation.',
    };
  }

  // POST /marketing/site/save — save site draft
  @Post('site/save')
  async saveSite(@Request() req: any, @Body() dto: { name?: string; htmlContent: string; productId?: string }) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return { error: 'Workspace not found' };
    const site = await this.prisma.kloelSite.create({
      data: {
        workspaceId,
        name: dto.name || 'Site sem titulo',
        htmlContent: dto.htmlContent,
        productId: dto.productId || null,
      },
    });
    return { site, success: true };
  }

  // PUT /marketing/site/:id — update site
  @Put('site/:id')
  async updateSite(@Request() req: any, @Param('id') id: string, @Body() dto: any) {
    const workspaceId = req.user?.workspaceId;
    const existing = await this.prisma.kloelSite.findFirst({ where: { id, workspaceId } });
    if (!existing) return { error: 'Site not found' };
    const { id: _, workspaceId: __, ...data } = dto;
    const site = await this.prisma.kloelSite.update({ where: { id }, data });
    return { site, success: true };
  }

  // POST /marketing/site/:id/publish — publish site with slug
  @Post('site/:id/publish')
  async publishSite(@Request() req: any, @Param('id') id: string) {
    const workspaceId = req.user?.workspaceId;
    const existing = await this.prisma.kloelSite.findFirst({ where: { id, workspaceId } });
    if (!existing) return { error: 'Site not found' };

    const baseSlug = (existing.name || 'site')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const slug = `${baseSlug}-${id.slice(0, 6)}`;

    const site = await this.prisma.kloelSite.update({
      where: { id },
      data: { published: true, slug },
    });
    return { site, slug, url: `/s/${slug}`, success: true };
  }

  // DELETE /marketing/site/:id
  @Delete('site/:id')
  async deleteSite(@Request() req: any, @Param('id') id: string) {
    const workspaceId = req.user?.workspaceId;
    const existing = await this.prisma.kloelSite.findFirst({ where: { id, workspaceId } });
    if (!existing) return { error: 'Site not found' };
    await this.prisma.kloelSite.delete({ where: { id } });
    return { success: true };
  }
}
