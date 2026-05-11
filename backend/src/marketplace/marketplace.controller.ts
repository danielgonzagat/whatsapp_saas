import { Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { MarketplaceService } from './marketplace.service';

/** Marketplace controller. */
@Controller('marketplace')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class MarketplaceController {
  constructor(private readonly marketplaceService: MarketplaceService) {}

  /** List templates. */
  @Get('templates')
  async listTemplates(@Query('category') category?: string) {
    return this.marketplaceService.listTemplates(category);
  }

  /** Install template. */
  @Post('install/:templateId')
  async installTemplate(@Request() req, @Param('templateId') templateId: string) {
    return this.marketplaceService.installTemplate(req.user.workspaceId, templateId);
  }
}
