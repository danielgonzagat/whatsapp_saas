import { Controller, Get, Post, Put, Delete, Body, Param, Query, Request, UseGuards, ServiceUnavailableException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import OpenAI from 'openai';

@UseGuards(JwtAuthGuard)
@Controller('canvas')
export class CanvasController {
  constructor(private readonly prisma: PrismaService) {}

  // GET /canvas/designs — list designs for workspace
  @Get('designs')
  async listDesigns(@Request() req: any, @Query('productId') productId?: string) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return { designs: [], count: 0 };
    const where: any = { workspaceId };
    if (productId) where.productId = productId;
    const designs = await this.prisma.kloelDesign.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });
    return { designs, count: designs.length };
  }

  // GET /canvas/designs/:id — get single design
  @Get('designs/:id')
  async getDesign(@Request() req: any, @Param('id') id: string) {
    const workspaceId = req.user?.workspaceId;
    const design = await this.prisma.kloelDesign.findFirst({
      where: { id, workspaceId },
    });
    return { design };
  }

  // POST /canvas/designs — create design
  @Post('designs')
  async createDesign(@Request() req: any, @Body() dto: {
    name?: string;
    format: string;
    width: number;
    height: number;
    productId?: string;
    elements?: any;
    background?: string;
  }) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) throw new NotFoundException('Workspace not found');
    const design = await this.prisma.kloelDesign.create({
      data: {
        workspaceId,
        name: dto.name || 'Design sem titulo',
        format: dto.format,
        width: dto.width,
        height: dto.height,
        productId: dto.productId || null,
        elements: dto.elements || [],
        background: dto.background || '#0A0A0C',
      },
    });
    return { design, success: true };
  }

  // PUT /canvas/designs/:id — update design (auto-save)
  @Put('designs/:id')
  async updateDesign(@Request() req: any, @Param('id') id: string, @Body() dto: any) {
    const workspaceId = req.user?.workspaceId;
    const existing = await this.prisma.kloelDesign.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException('Design not found');
    const { id: _, workspaceId: __, ...data } = dto;
    const design = await this.prisma.kloelDesign.update({ where: { id }, data });
    return { design, success: true };
  }

  // DELETE /canvas/designs/:id — delete design
  @Delete('designs/:id')
  async deleteDesign(@Request() req: any, @Param('id') id: string) {
    const workspaceId = req.user?.workspaceId;
    const existing = await this.prisma.kloelDesign.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException('Design not found');
    await this.prisma.kloelDesign.delete({ where: { id } });
    return { success: true };
  }

  // POST /canvas/generate — generate enriched prompt with product data
  @Post('generate')
  async generateImage(@Request() req: any, @Body() dto: {
    prompt: string;
    productId?: string;
    width?: number;
    height?: number;
  }) {
    const workspaceId = req.user?.workspaceId;
    let enrichedPrompt = dto.prompt;

    if (dto.productId && workspaceId) {
      const product = await this.prisma.product.findFirst({
        where: { id: dto.productId, workspaceId },
      });
      if (product) {
        enrichedPrompt = `[CONTEXTO DO PRODUTO]
Nome: ${product.name}
Preco: ${product.currency || 'BRL'} ${product.price}
Categoria: ${product.category || 'N/A'}
Descricao: ${product.description || 'N/A'}
Formato: ${product.format || 'Digital'}

[PEDIDO DO USUARIO]
${dto.prompt}

[INSTRUCOES]
Gere uma descricao visual detalhada para criacao de imagem de marketing. Dark theme (#0A0A0C bg, #E85D30 accent, #E0DDD8 text). Font: Sora. Profissional e moderno.`;
      }
    }

    if (!process.env.OPENAI_API_KEY) {
      throw new ServiceUnavailableException('Image generation requires OPENAI_API_KEY');
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.images.generate({
      model: 'dall-e-3',
      prompt: enrichedPrompt || dto.prompt,
      n: 1,
      size: '1024x1024',
    });
    const imageUrl = response.data[0]?.url;
    return { success: true, imageUrl, prompt: enrichedPrompt };
  }

  // POST /canvas/generate-text — suggest marketing text based on product
  @Post('generate-text')
  async generateText(@Request() req: any, @Body() dto: {
    type: string;
    productId?: string;
  }) {
    const workspaceId = req.user?.workspaceId;
    let context = '';

    if (dto.productId && workspaceId) {
      const product = await this.prisma.product.findFirst({
        where: { id: dto.productId, workspaceId },
      });
      if (product) {
        context = `${product.name} — ${product.currency || 'R$'} ${product.price}`;
      }
    }

    const templates: Record<string, string[]> = {
      headline: [
        context ? `Descubra ${context.split(' — ')[0]}` : 'Transforme seu negocio',
        'A revolucao que voce esperava comeca aqui',
        'Pare de perder tempo. Comece a ganhar dinheiro.',
        context ? `${context.split(' — ')[0]} — Oferta por tempo limitado` : 'Oferta especial',
      ],
      subtitle: [
        'Descubra como milhares de empreendedores ja estao usando',
        'O metodo comprovado que gera resultados em 30 dias',
        context ? `Tudo que voce precisa por apenas ${context.split(' — ')[1] || ''}` : 'Acesso imediato',
      ],
      cta: ['Comecar agora', 'Quero acesso', 'Garantir minha vaga', 'Comprar com desconto', 'Testar gratis'],
    };

    return {
      suggestions: templates[dto.type] || templates.headline,
      context,
    };
  }
}
