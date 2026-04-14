import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Request,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces';
import { PrismaService } from '../prisma/prisma.service';
import { resolveKloelCapabilityModel } from '../lib/ai-models';

@UseGuards(JwtAuthGuard)
@Controller('kloel/site')
export class SiteController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  // GET /kloel/site/list — list sites for workspace
  @Get('list')
  async listSites(@Request() req: AuthenticatedRequest) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return { sites: [], count: 0 };
    const sites = await this.prisma.kloelSite.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: 'desc' },
    });
    return { sites, count: sites.length };
  }

  // POST /kloel/site/generate — generate site HTML (proxy to AI)
  @Post('generate')
  async generateSite(
    @Request() req: AuthenticatedRequest,
    @Body() dto: { prompt: string; currentHtml?: string },
  ) {
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
      dto.currentHtml
        ? 'The user wants to edit an existing page. Here is the current HTML:\n' + dto.currentHtml
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      // tokenBudget: site generation is a one-shot action; budget enforced at plan level
      if (openaiKey) {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model: resolveKloelCapabilityModel('generate_site_openai'),
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: dto.prompt },
            ],
            max_tokens: 4096,
            temperature: 0.7,
          }),
          signal: AbortSignal.timeout(60000),
        });

        if (!response.ok) {
          const err = await response.text();
          throw new Error(`OpenAI API error ${response.status}: ${err}`);
        }

        const result = await response.json();
        const html = result.choices?.[0]?.message?.content?.trim() || null;
        return { success: true, html, message: 'Generated via OpenAI' };
      }

      // tokenBudget: site generation is a one-shot action; budget enforced at plan level
      // Fallback to Anthropic
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: resolveKloelCapabilityModel('generate_site_anthropic'),
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: 'user', content: dto.prompt }],
        }),
        signal: AbortSignal.timeout(60000),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Anthropic API error ${response.status}: ${err}`);
      }

      const result = await response.json();
      const html = result.content?.[0]?.text?.trim() || null;
      return { success: true, html, message: 'Generated via Anthropic' };
    } catch (error: unknown) {
      throw new ServiceUnavailableException(
        `AI generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  // POST /kloel/site/save — save site draft
  @Post('save')
  async saveSite(
    @Request() req: AuthenticatedRequest,
    @Body()
    dto: { name?: string; htmlContent: string; productId?: string; idempotencyKey?: string },
  ) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) throw new NotFoundException('Workspace not found');
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

  // PUT /kloel/site/:id — update site
  @Put(':id')
  async updateSite(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: Record<string, unknown>,
  ) {
    const workspaceId = req.user?.workspaceId;
    const existing = await this.prisma.kloelSite.findFirst({
      where: { id, workspaceId },
    });
    if (!existing) throw new NotFoundException('Site not found');
    const { id: _, workspaceId: __, ...data } = dto;
    await this.prisma.kloelSite.updateMany({ where: { id, workspaceId }, data });
    return { site: { ...existing, ...data }, success: true };
  }

  // POST /kloel/site/:id/publish — publish site with slug
  @Post(':id/publish')
  async publishSite(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    const workspaceId = req.user?.workspaceId;
    const existing = await this.prisma.kloelSite.findFirst({
      where: { id, workspaceId },
    });
    if (!existing) throw new NotFoundException('Site not found');

    const baseSlug = (existing.name || 'site')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const slug = `${baseSlug}-${id.slice(0, 6)}`;

    await this.prisma.kloelSite.updateMany({
      where: { id, workspaceId },
      data: { published: true, slug },
    });
    return {
      site: { ...existing, published: true, slug },
      slug,
      url: `/s/${slug}`,
      success: true,
    };
  }

  // DELETE /kloel/site/:id
  @Delete(':id')
  async deleteSite(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    const workspaceId = req.user?.workspaceId;
    const existing = await this.prisma.kloelSite.findFirst({
      where: { id, workspaceId },
    });
    if (!existing) throw new NotFoundException('Site not found');
    await this.auditService.log({
      workspaceId: workspaceId || 'unknown',
      action: 'DELETE_RECORD',
      resource: 'KloelSite',
      resourceId: id,
      details: { deletedBy: 'user', name: existing.name },
    });
    await this.prisma.kloelSite.deleteMany({ where: { id, workspaceId } });
    return { success: true };
  }
}
