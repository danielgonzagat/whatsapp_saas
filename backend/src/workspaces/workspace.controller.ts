import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

import { WorkspaceService } from './workspace.service';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { SetSettingsDto } from './dto/set-settings.dto';

@Controller('workspace')
@UseGuards(JwtAuthGuard)
export class WorkspaceController {
  constructor(private readonly service: WorkspaceService) {}

  @Get('me')
  getMe(@Req() req: any) {
    const workspaceId = resolveWorkspaceId(req);
    return this.service.getWorkspace(workspaceId);
  }

  // Obter workspace
  @Get(':id')
  get(@Req() req: any, @Param('id') id: string) {
    const workspaceId = resolveWorkspaceId(req, id);
    return this.service.getWorkspace(workspaceId);
  }

  // Definir provedor
  @Post(':id/provider')
  @Roles('ADMIN')
  setProvider(
    @Req() req: any,
    @Param('id') id: string,
    @Body('provider') provider: string,
  ) {
    const workspaceId = resolveWorkspaceId(req, id);
    return this.service.setProvider(workspaceId, provider);
  }

  // Anti-ban / Jitter
  @Post(':id/jitter')
  @Roles('ADMIN')
  setJitter(
    @Req() req: any,
    @Param('id') id: string,
    @Body('min') min: number,
    @Body('max') max: number,
  ) {
    const workspaceId = resolveWorkspaceId(req, id);
    return this.service.setJitter(workspaceId, min, max);
  }

  // Canais disponíveis (omnichannel beta)
  @Get(':id/channels')
  getChannels(@Req() req: any, @Param('id') id: string) {
    const workspaceId = resolveWorkspaceId(req, id);
    return this.service.getChannels(workspaceId);
  }

  // Canal Email: toggle (requires ADMIN)
  @Post(':id/channels')
  @Roles('ADMIN')
  toggleChannels(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { email?: boolean },
  ) {
    const workspaceId = resolveWorkspaceId(req, id);
    return this.service.setChannels(workspaceId, body?.email);
  }

  // Retorna settings do workspace (providerSettings + jitter)
  @Get(':id/settings')
  async getSettings(@Req() req: any, @Param('id') id: string) {
    const workspaceId = resolveWorkspaceId(req, id);
    const ws = await this.service.getWorkspace(workspaceId);
    return {
      providerSettings: ws.providerSettings,
      jitterMin: ws.jitterMin,
      jitterMax: ws.jitterMax,
      customDomain: ws.customDomain,
      branding: ws.branding,
    };
  }

  // Atualiza providerSettings com merge simples (ex: autopilot config)
  @Post(':id/settings')
  @Roles('ADMIN')
  setSettings(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: SetSettingsDto,
  ) {
    const workspaceId = resolveWorkspaceId(req, id);
    return this.service.patchSettings(workspaceId, body || {});
  }

  // Atualiza informações gerais da conta (nome, phone, timezone, webhook, notificações)
  @Post(':id/account')
  setAccount(
    @Req() req: any,
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      phone?: string;
      timezone?: string;
      webhookUrl?: string;
      website?: string;
      language?: string;
      dateFormat?: string;
      notifications?: Record<string, boolean>;
    },
  ) {
    const workspaceId = resolveWorkspaceId(req, id);
    return this.service.updateAccountSettings(workspaceId, body || {});
  }
}
