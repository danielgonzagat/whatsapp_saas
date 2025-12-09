import { Controller, Get, Post, Param, Body, Req } from '@nestjs/common';

import { WorkspaceService } from './workspace.service';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';

@Controller('workspace')
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
    return this.service.setProvider(workspaceId, provider as any);
  }

  // Meta
  @Post(':id/meta')
  @Roles('ADMIN')
  setMeta(
    @Req() req: any,
    @Param('id') id: string,
    @Body('token') token: string,
    @Body('phoneId') phoneId: string,
  ) {
    const workspaceId = resolveWorkspaceId(req, id);
    return this.service.setMeta(workspaceId, token, phoneId);
  }

  // WPPConnect
  @Post(':id/wpp')
  @Roles('ADMIN')
  setWpp(
    @Req() req: any,
    @Param('id') id: string,
    @Body('sessionId') sessionId: string,
  ) {
    const workspaceId = resolveWorkspaceId(req, id);
    return this.service.setWppSession(workspaceId, sessionId);
  }

  // Evolution
  @Post(':id/evolution')
  @Roles('ADMIN')
  setEvolution(
    @Req() req: any,
    @Param('id') id: string,
    @Body('apiKey') apiKey: string,
  ) {
    const workspaceId = resolveWorkspaceId(req, id);
    return this.service.setEvolutionKey(workspaceId, apiKey);
  }

  // UltraWA
  @Post(':id/ultrawa')
  @Roles('ADMIN')
  setUltraWA(
    @Req() req: any,
    @Param('id') id: string,
    @Body('apiKey') apiKey: string,
  ) {
    const workspaceId = resolveWorkspaceId(req, id);
    return this.service.setUltraWAKey(workspaceId, apiKey);
  }

  // Recriptografar segredos de provedores
  @Post(':id/rotate-secrets')
  @Roles('ADMIN')
  rotateSecrets(@Req() req: any, @Param('id') id: string) {
    const workspaceId = resolveWorkspaceId(req, id);
    return this.service.rotateProviderSecrets(workspaceId);
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

  // Canal Email/Telegram: toggle (requires ADMIN)
  @Post(':id/channels')
  @Roles('ADMIN')
  toggleChannels(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { email?: boolean; telegram?: boolean },
  ) {
    const workspaceId = resolveWorkspaceId(req, id);
    return this.service.setChannels(workspaceId, body?.email, body?.telegram);
  }

  // Atualiza providerSettings com merge simples (ex: autopilot config)
  @Post(':id/settings')
  @Roles('ADMIN')
  setSettings(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const workspaceId = resolveWorkspaceId(req, id);
    return this.service.patchSettings(workspaceId, body || {});
  }

  // Atualiza informações gerais da conta (nome, phone, timezone, webhook, notificações)
  @Post(':id/account')
  setAccount(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: {
      name?: string;
      phone?: string;
      timezone?: string;
      webhookUrl?: string;
      notifications?: Record<string, boolean>;
    },
  ) {
    const workspaceId = resolveWorkspaceId(req, id);
    return this.service.updateAccountSettings(workspaceId, body || {});
  }
}
