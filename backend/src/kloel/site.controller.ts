import { Controller, Get, Post, Put, Delete, Body, Param, Request, UseGuards, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
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
    const openaiKey = process.env.OPENAI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    if (!openaiKey && !anthropicKey) {
      throw new ServiceUnavailableException(
        'AI site generation is not available. Configure OPENAI_API_KEY or ANTHROPIC_API_KEY.',
      );
    }

    const systemPrompt = [
      'You are a landing page generator. Return ONLY valid HTML (no markdown, no code fences).',
      'The HTML must be a complete, self-contained page with inline CSS.',
      'Use modern design: dark background (#0A0A0C), light text (#E0DDD8), accent (#E85D30).',
      dto.currentHtml ? 'The user wants to edit an existing page. Here is the current HTML:\n' + dto.currentHtml : '',
    ].filter(Boolean).join('\n');

    try {
      if (openaiKey) {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: dto.prompt },
            ],
            max_tokens: 4096,
            temperature: 0.7,
          }),
        });

        if (!response.ok) {
          const err = await response.text();
          throw new Error(`OpenAI API error ${response.status}: ${err}`);
        }

        const result = await response.json();
        const html = result.choices?.[0]?.message?.content?.trim() || null;
        return { success: true, html, message: 'Generated via OpenAI' };
      }

      // Fallback to Anthropic
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: 'user', content: dto.prompt }],
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Anthropic API error ${response.status}: ${err}`);
      }

      const result = await response.json();
      const html = result.content?.[0]?.text?.trim() || null;
      return { success: true, html, message: 'Generated via Anthropic' };
    } catch (error: any) {
      throw new ServiceUnavailableException(
        `AI generation failed: ${error.message || 'Unknown error'}`,
      );
    }
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
