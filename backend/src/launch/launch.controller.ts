import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Res,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LaunchService } from './launch.service';
import { Response } from 'express';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { Public } from '../auth/public.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('Launchpad')
@Controller('launch')
export class LaunchController {
  constructor(private readonly launchService: LaunchService) {}

  @Post('launcher')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create a new group launcher' })
  async createLauncher(@Req() req: any, @Body() body: any) {
    const { workspaceId, ...data } = body;
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.launchService.createLauncher(effectiveWorkspaceId, data);
  }

  @Post('launcher/:id/groups')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Add a group to a launcher' })
  async addGroup(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    const { workspaceId, ...data } = body;
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.launchService.addGroup(effectiveWorkspaceId, id, data);
  }

  @Public()
  @Get('join/:slug')
  @ApiOperation({ summary: 'Public redirect link for joining groups' })
  async joinLaunch(@Param('slug') slug: string, @Res() res: Response) {
    const link = await this.launchService.getRedirectLink(slug);
    // Evita open-redirect: só permite URLs WhatsApp conhecidas
    try {
      const url = new URL(link);
      const allowedHosts = new Set([
        'chat.whatsapp.com',
        'wa.me',
        'api.whatsapp.com',
        'www.whatsapp.com',
      ]);
      if (url.protocol !== 'https:' || !allowedHosts.has(url.hostname)) {
        throw new Error('invalid_redirect');
      }
    } catch {
      throw new BadRequestException('Invalid redirect link');
    }
    return res.redirect(link);
  }
}
