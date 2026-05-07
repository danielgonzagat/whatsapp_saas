import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { resolveWorkspaceId } from '../auth/workspace-access';
import {
  asProviderSettings,
  type ProviderSettings,
  type ProviderSessionSnapshot,
} from '../whatsapp/provider-settings.types';
import { resolveWhatsAppProvider } from '../whatsapp/providers/provider-env';
import { SetSettingsDto } from './dto/set-settings.dto';
import {
  buildProviderSessionSnapshot,
  computeDisconnectReason,
  computeNormalizedStatus,
  extractPhoneNumberId,
  extractRawStatus,
} from './provider-status.util';
import { WorkspaceService } from './workspace.service';

interface AccountUpdateBody {
  name?: string;
  phone?: string;
  timezone?: string;
  webhookUrl?: string;
  website?: string;
  language?: string;
  dateFormat?: string;
  role?: string;
  notifications?: Record<string, boolean>;
}

/** Workspace controller. */
@Controller('workspace')
@UseGuards(JwtAuthGuard)
export class WorkspaceController {
  constructor(private readonly service: WorkspaceService) {}

  private normalizeProviderSettings(rawSettings: unknown, workspaceId: string): ProviderSettings {
    const settings: ProviderSettings = { ...asProviderSettings(rawSettings) };
    const session: ProviderSessionSnapshot =
      settings.whatsappApiSession || settings.whatsappWebSession || {};
    const providerType = resolveWhatsAppProvider(settings.whatsappProvider || session.provider);
    const rawStatus = extractRawStatus(session, settings);
    const phoneNumberId = extractPhoneNumberId(providerType, session);
    const normalizedStatus = computeNormalizedStatus(providerType, rawStatus, phoneNumberId);
    const disconnectReason = computeDisconnectReason(
      session,
      providerType,
      normalizedStatus,
      phoneNumberId,
    );

    settings.whatsappProvider = providerType;
    settings.connectionStatus = normalizedStatus;
    settings.whatsappApiSession = buildProviderSessionSnapshot({
      providerType,
      session,
      rawStatus,
      normalizedStatus,
      phoneNumberId,
      disconnectReason,
      workspaceId,
    });
    delete settings.whatsappWebSession;
    return settings;
  }

  /** Get me. */
  @Get('me')
  getMe(@Req() req: AuthenticatedRequest) {
    const workspaceId = resolveWorkspaceId(req);
    return this.service.getWorkspace(workspaceId);
  }

  // Obter workspace
  @Get(':id')
  get(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const workspaceId = resolveWorkspaceId(req, id);
    return this.service.getWorkspace(workspaceId);
  }

  // Definir provedor
  @Post(':id/provider')
  @Roles('ADMIN')
  setProvider(
    @Req() req: AuthenticatedRequest,
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
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body('min') min: number,
    @Body('max') max: number,
  ) {
    const workspaceId = resolveWorkspaceId(req, id);
    return this.service.setJitter(workspaceId, min, max);
  }

  // Canais disponíveis (omnichannel beta)
  @Get(':id/channels')
  getChannels(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const workspaceId = resolveWorkspaceId(req, id);
    return this.service.getChannels(workspaceId);
  }

  // Canal Email: toggle (requires ADMIN)
  @Post(':id/channels')
  @Roles('ADMIN')
  toggleChannels(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { email?: boolean },
  ) {
    const workspaceId = resolveWorkspaceId(req, id);
    return this.service.setChannels(workspaceId, body?.email);
  }

  // Retorna settings do workspace (providerSettings + jitter)
  @Get(':id/settings')
  async getSettings(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
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

  /** Get account. */
  @Get(':id/account')
  getAccount(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const workspaceId = resolveWorkspaceId(req, id);
    return this.service.getAccountSettings(workspaceId);
  }

  // Atualiza providerSettings com merge simples (ex: autopilot config)
  @Post(':id/settings')
  @Roles('ADMIN')
  setSettings(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: SetSettingsDto,
  ) {
    const workspaceId = resolveWorkspaceId(req, id);
    return this.service.patchSettings(workspaceId, (body || {}) as Record<string, unknown>);
  }

  // Atualiza informações gerais da conta (nome, phone, timezone, webhook, notificações)
  @Post(':id/account')
  setAccount(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: AccountUpdateBody,
  ) {
    const workspaceId = resolveWorkspaceId(req, id);
    return this.service.updateAccountSettings(workspaceId, body || {});
  }

  // Deletar workspace
  @Delete(':id')
  @Roles('ADMIN')
  async delete(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const workspaceId = resolveWorkspaceId(req, id);
    await this.service.deleteWorkspace(workspaceId);
    return { ok: true, deleted: workspaceId };
  }
}
