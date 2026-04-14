import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { resolveWhatsAppProvider } from '../whatsapp/providers/provider-env';
import { SetSettingsDto } from './dto/set-settings.dto';
import { WorkspaceService } from './workspace.service';

@Controller('workspace')
@UseGuards(JwtAuthGuard)
export class WorkspaceController {
  constructor(private readonly service: WorkspaceService) {}

  private normalizeProviderSettings(
    rawSettings: unknown,
    workspaceId: string,
  ): Record<string, any> {
    const settings = {
      ...((rawSettings as Record<string, any>) || {}),
    };
    const session =
      ((settings.whatsappApiSession || settings.whatsappWebSession || {}) as Record<string, any>) ||
      {};
    const providerType = resolveWhatsAppProvider(settings.whatsappProvider || session.provider);
    const rawStatus = String(session.rawStatus || session.status || settings.connectionStatus || '')
      .trim()
      .toUpperCase();
    const phoneNumberId =
      providerType === 'meta-cloud' ? String(session.phoneNumberId || '').trim() || null : null;
    const normalizedStatus =
      providerType === 'whatsapp-api'
        ? rawStatus === 'CONNECTED' || rawStatus === 'WORKING'
          ? 'connected'
          : rawStatus === 'SCAN_QR_CODE' || rawStatus === 'STARTING' || rawStatus === 'OPENING'
            ? 'connecting'
            : rawStatus === 'FAILED'
              ? 'failed'
              : 'disconnected'
        : rawStatus === 'CONNECTED' || rawStatus === 'WORKING'
          ? 'connected'
          : phoneNumberId
            ? 'connection_incomplete'
            : 'disconnected';
    const disconnectReason =
      typeof session.disconnectReason === 'string' && session.disconnectReason.trim()
        ? session.disconnectReason
        : providerType === 'meta-cloud'
          ? phoneNumberId
            ? 'meta_whatsapp_phone_number_id_missing'
            : 'meta_auth_required'
          : normalizedStatus === 'connecting'
            ? 'waha_qr_pending'
            : normalizedStatus === 'failed'
              ? 'waha_session_failed'
              : 'waha_session_disconnected';

    settings.whatsappProvider = providerType;
    settings.connectionStatus = normalizedStatus;
    settings.whatsappApiSession = {
      qrCode:
        providerType === 'whatsapp-api' &&
        typeof session.qrCode === 'string' &&
        session.qrCode.trim()
          ? session.qrCode
          : null,
      status: normalizedStatus,
      authUrl:
        providerType === 'meta-cloud' &&
        typeof session.authUrl === 'string' &&
        session.authUrl.trim()
          ? session.authUrl
          : null,
      selfIds: Array.isArray(session.selfIds) ? session.selfIds : [],
      provider: providerType,
      pushName: session.pushName || null,
      rawStatus:
        rawStatus ||
        (normalizedStatus === 'connected'
          ? 'CONNECTED'
          : providerType === 'meta-cloud' && phoneNumberId
            ? 'CONNECTION_INCOMPLETE'
            : providerType === 'whatsapp-api' && normalizedStatus === 'connecting'
              ? 'SCAN_QR_CODE'
              : 'DISCONNECTED'),
      connectedAt: session.connectedAt || null,
      lastUpdated: session.lastUpdated || null,
      phoneNumber: session.phoneNumber || null,
      sessionName: String(session.sessionName || '').trim() || workspaceId,
      phoneNumberId,
      disconnectReason: normalizedStatus === 'connected' ? null : disconnectReason,
      whatsappBusinessId: providerType === 'meta-cloud' ? session.whatsappBusinessId || null : null,
    };
    delete settings.whatsappWebSession;
    return settings;
  }

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
  setProvider(@Req() req: any, @Param('id') id: string, @Body('provider') provider: string) {
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
  toggleChannels(@Req() req: any, @Param('id') id: string, @Body() body: { email?: boolean }) {
    const workspaceId = resolveWorkspaceId(req, id);
    return this.service.setChannels(workspaceId, body?.email);
  }

  // Retorna settings do workspace (providerSettings + jitter)
  @Get(':id/settings')
  async getSettings(@Req() req: any, @Param('id') id: string) {
    const workspaceId = resolveWorkspaceId(req, id);
    const ws = await this.service.getWorkspace(workspaceId);
    return {
      providerSettings: this.normalizeProviderSettings(ws.providerSettings, workspaceId),
      jitterMin: ws.jitterMin,
      jitterMax: ws.jitterMax,
      customDomain: ws.customDomain,
      branding: ws.branding,
    };
  }

  @Get(':id/account')
  getAccount(@Req() req: any, @Param('id') id: string) {
    const workspaceId = resolveWorkspaceId(req, id);
    return this.service.getAccountSettings(workspaceId);
  }

  // Atualiza providerSettings com merge simples (ex: autopilot config)
  @Post(':id/settings')
  @Roles('ADMIN')
  setSettings(@Req() req: any, @Param('id') id: string, @Body() body: SetSettingsDto) {
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
      role?: string;
      notifications?: Record<string, boolean>;
    },
  ) {
    const workspaceId = resolveWorkspaceId(req, id);
    return this.service.updateAccountSettings(workspaceId, body || {});
  }
}
