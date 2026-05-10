import { Body, Controller, Delete, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import {
  ChannelSetupService,
  SaveArsenalInput,
  SaveConfigInput,
  SaveProductsInput,
} from './channel-setup.service';

@Controller('channel-setup')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class ChannelSetupController {
  constructor(private readonly setup: ChannelSetupService) {}

  @Get(':channel')
  getState(@Request() req: AuthenticatedRequest, @Param('channel') channel: string) {
    return this.setup.getState(req.user.workspaceId, channel);
  }

  @Post(':channel/products')
  saveProducts(
    @Request() req: AuthenticatedRequest,
    @Param('channel') channel: string,
    @Body() body: SaveProductsInput,
  ) {
    return this.setup.saveProducts(req.user.workspaceId, channel, body);
  }

  @Post(':channel/arsenal')
  addArsenal(
    @Request() req: AuthenticatedRequest,
    @Param('channel') channel: string,
    @Body() body: SaveArsenalInput,
  ) {
    return this.setup.addArsenal(req.user.workspaceId, channel, body);
  }

  @Delete(':channel/arsenal/:assetId')
  removeArsenal(
    @Request() req: AuthenticatedRequest,
    @Param('channel') channel: string,
    @Param('assetId') assetId: string,
  ) {
    return this.setup.removeArsenal(req.user.workspaceId, channel, assetId);
  }

  @Post(':channel/config')
  saveConfig(
    @Request() req: AuthenticatedRequest,
    @Param('channel') channel: string,
    @Body() body: SaveConfigInput,
  ) {
    return this.setup.saveConfig(req.user.workspaceId, channel, body);
  }

  @Post(':channel/complete')
  complete(@Request() req: AuthenticatedRequest, @Param('channel') channel: string) {
    return this.setup.complete(req.user.workspaceId, channel);
  }

  @Post(':channel/reconfigure')
  reconfigure(@Request() req: AuthenticatedRequest, @Param('channel') channel: string) {
    return this.setup.reconfigure(req.user.workspaceId, channel);
  }
}
