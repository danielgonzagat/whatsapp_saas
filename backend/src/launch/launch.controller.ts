import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../auth/public.decorator';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { AddGroupDto, CreateLauncherDto } from './dto/create-launcher.dto';
import { LaunchService } from './launch.service';

/** Launch controller. */
@ApiTags('Launchpad')
@Controller('launch')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class LaunchController {
  constructor(private readonly launchService: LaunchService) {}

  /** List launchers. */
  // PULSE_OK: admin-only route, accessed via admin panel
  @Get('launchers')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all launchers for the workspace' })
  async listLaunchers(@Req() req: AuthenticatedRequest) {
    const workspaceId = resolveWorkspaceId(req);
    return this.launchService.listLaunchers(workspaceId);
  }

  /** Create launcher. */
  @Post('launcher')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new group launcher' })
  async createLauncher(
    @Req() req: AuthenticatedRequest,
    @Body() body: CreateLauncherDto & { workspaceId?: string },
  ) {
    const { workspaceId, ...data } = body;
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.launchService.createLauncher(effectiveWorkspaceId, data);
  }

  /** Add group. */
  @Post('launcher/:id/groups')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a group to a launcher' })
  async addGroup(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: AddGroupDto & { workspaceId?: string },
  ) {
    const { workspaceId, ...data } = body;
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.launchService.addGroup(effectiveWorkspaceId, id, data);
  }

  /** Join launch. */
  @Public()
  @Get('join/:slug')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
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
