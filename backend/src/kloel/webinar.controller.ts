import { Controller, Get, Post, Put, Delete, Body, Param, Request, UseGuards, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';

@UseGuards(JwtAuthGuard, WorkspaceGuard)
@Controller('webinars')
export class WebinarController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Request() req: any) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return { webinars: [], count: 0 };
    const webinars = await this.prisma.webinar.findMany({
      where: { workspaceId },
      orderBy: { date: 'desc' },
    });
    return { webinars, count: webinars.length };
  }

  @Post()
  async create(
    @Request() req: any,
    @Body() body: { title: string; url: string; date: string; description?: string; productId?: string },
  ) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) throw new NotFoundException('Workspace not found');
    const webinar = await this.prisma.webinar.create({
      data: {
        workspaceId,
        title: body.title,
        url: body.url,
        date: new Date(body.date),
        description: body.description || null,
        productId: body.productId || null,
      },
    });
    return { webinar, success: true };
  }

  @Put(':id')
  async update(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    const workspaceId = req.user?.workspaceId;
    const existing = await this.prisma.webinar.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException('Webinar not found');
    const { id: _, workspaceId: __, ...data } = body;
    if (data.date && typeof data.date === 'string') {
      data.date = new Date(data.date);
    }
    const webinar = await this.prisma.webinar.update({ where: { id }, data });
    return { webinar, success: true };
  }

  @Delete(':id')
  async remove(@Request() req: any, @Param('id') id: string) {
    const workspaceId = req.user?.workspaceId;
    const existing = await this.prisma.webinar.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException('Webinar not found');
    await this.prisma.webinar.delete({ where: { id } });
    return { success: true };
  }
}
