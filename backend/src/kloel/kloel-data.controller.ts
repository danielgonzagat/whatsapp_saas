import { Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { AuthenticatedRequest } from '../common/interfaces';
import { InternalEndpoint } from '../common/decorators/internal-endpoint.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { exportData, requestDataDeletion } from './kloel-upload.controller-helpers';

@Controller('kloel')
export class KloelDataController {
  constructor(private readonly prisma: PrismaService) {}

  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Post('data/request-deletion')
  async handleDataDeletion(@Request() req: AuthenticatedRequest) {
    await requestDataDeletion(
      { prisma: this.prisma },
      req.workspaceId || req.user?.workspaceId,
      req.user?.sub,
    );
    return { success: true, message: 'Dados pessoais anonimizados conforme LGPD' };
  }

  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @InternalEndpoint('data export trigger')
  @Get('data/export')
  async handleDataExport(@Request() req: AuthenticatedRequest) {
    return exportData({ prisma: this.prisma }, req.workspaceId || req.user?.workspaceId);
  }
}
