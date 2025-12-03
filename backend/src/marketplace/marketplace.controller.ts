import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { MarketplaceService } from './marketplace.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('marketplace')
@UseGuards(JwtAuthGuard)
export class MarketplaceController {
  constructor(private readonly marketplaceService: MarketplaceService) {}

  @Get('templates')
  async listTemplates(@Query('category') category?: string) {
    return this.marketplaceService.listTemplates(category);
  }

  @Post('install/:templateId')
  async installTemplate(
    @Request() req,
    @Param('templateId') templateId: string,
  ) {
    return this.marketplaceService.installTemplate(
      req.user.workspaceId,
      templateId,
    );
  }
}
