import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
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

@Controller('workspace')
@UseGuards(JwtAuthGuard)
export class WorkspaceController {
  constructor(private readonly service: WorkspaceService) {}

  private static readonly RESPONSE_SECRET_KEYS = new Set([
    'accessToken',
    'access_token',
    'refreshToken',
    'refresh_token',
    'token',
    'idToken',
    'id_token',
    'apiKey',
    'api_key',
    'secret',
    'clientSecret',
    'client_secret',
    'privateKey',
    'private_key',
    'pageAccessToken',
    'page_access_token',
    'systemUserToken',
    'system_user_token',
    'appSecret',
    'app_secret',
    'verifyToken',
    'verify_token',
    'authorization',
    'cookie',
    'signedRequest',
    'signed_request',
    'password',
  ]);

  private sanitizeProviderSettings(value: unknown, key?: string, depth = 0): unknown {
    if (depth > 8 || value === null || value === undefined) {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeProviderSettings(item, undefined, depth + 1));
    }
    if (typeof value !== 'object') {
      return value;
    }

    if (key === 'credentials') {
      const entries = Object.entries(value as Record<string, unknown>).filter(
        ([, nested]) => nested !== null && nested !== undefined && nested !== '',
      );
      return { configured: entries.length > 0 };
    }

    const out: Record<string, unknown> = {};
    for (const [entryKey, raw] of Object.entries(value as Record<string, unknown>)) {
      if (WorkspaceController.RESPONSE_SECRET_KEYS.has(entryKey)) {
        continue;
      }
      out[entryKey] = this.sanitizeProviderSettings(raw, entryKey, depth + 1);
    }
    return out;
  }

  private normalizeProviderSettings(rawSettings: unknown, workspaceId: string): ProviderSettings {
    const settings: ProviderSettings = { ...asProviderSettings(rawSettings) };
    const session: ProviderSessionSnapshot =
      settings.whatsappApiSession || settings.whatsappWebSession || {};
    const providerType = resolveWhatsAppProvider(settings.whatsappProvider || session.provider);
    const providerSurface = providerType === 'whatsapp-api' ? 'legacy-runtime' : providerType;
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
    const rawDisconnectReason =
      typeof session.disconnectReason === 'string' && session.disconnectReason.trim()
        ? session.disconnectReason.trim()
        : null;
    const normalizedDisconnectReason =
      rawDisconnectReason === 'waha_qr_pending'
        ? 'legacy_runtime_qr_pending'
        : rawDisconnectReason === 'waha_session_failed'
          ? 'legacy_runtime_failed'
          : rawDisconnectReason === 'waha_session_disconnected'
            ? 'legacy_runtime_disconnected'
            : rawDisconnectReason;
    const disconnectReason =
      normalizedDisconnectReason
        ? normalizedDisconnectReason
        : providerType === 'meta-cloud'
          ? phoneNumberId
            ? 'meta_whatsapp_phone_number_id_missing'
            : 'meta_auth_required'
          : normalizedStatus === 'connecting'
            ? 'legacy_runtime_qr_pending'
            : normalizedStatus === 'failed'
              ? 'legacy_runtime_failed'
              : 'legacy_runtime_disconnected';

    settings.whatsappProvider = providerSurface;
    settings.connectionStatus = normalizedStatus;
    settings.whatsappApiSession = {
      qrCode: null,
      status: normalizedStatus,
      authUrl:
        providerType === 'meta-cloud' &&
        typeof session.authUrl === 'string' &&
        session.authUrl.trim()
          ? session.authUrl
          : null,
      selfIds: Array.isArray(session.selfIds) ? session.selfIds : [],
      provider: providerSurface,
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
    return this.sanitizeProviderSettings(settings) as ProviderSettings;
  }

  private serializeWorkspace(workspace: Record<string, unknown> & { id: string }) {
    return {
      ...workspace,
      providerSettings: this.normalizeProviderSettings(workspace.providerSettings, workspace.id),
    };
  }

  @Get('me')
  async getMe(@Req() req: AuthenticatedRequest) {
    const workspaceId = resolveWorkspaceId(req);
    return this.serializeWorkspace(await this.service.getWorkspace(workspaceId));
  }

  // Obter workspace
  @Get(':id')
  async get(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const workspaceId = resolveWorkspaceId(req, id);
    return this.serializeWorkspace(await this.service.getWorkspace(workspaceId));
  }

  // Definir provedor
  @Post(':id/provider')
  @Roles('ADMIN')
  async setProvider(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body('provider') provider: string,
  ) {
    const workspaceId = resolveWorkspaceId(req, id);
    return this.serializeWorkspace(await this.service.setProvider(workspaceId, provider));
  }

  // Anti-ban / Jitter
  @Post(':id/jitter')
  @Roles('ADMIN')
  async setJitter(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body('min') min: number,
    @Body('max') max: number,
  ) {
    const workspaceId = resolveWorkspaceId(req, id);
    return this.serializeWorkspace(await this.service.setJitter(workspaceId, min, max));
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
  async toggleChannels(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { email?: boolean },
  ) {
    const workspaceId = resolveWorkspaceId(req, id);
    return this.serializeWorkspace(await this.service.setChannels(workspaceId, body?.email));
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

  @Get(':id/account')
  getAccount(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const workspaceId = resolveWorkspaceId(req, id);
    return this.service.getAccountSettings(workspaceId);
  }

  // Atualiza providerSettings com merge simples (ex: autopilot config)
  @Post(':id/settings')
  @Roles('ADMIN')
  async setSettings(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: SetSettingsDto,
  ) {
    const workspaceId = resolveWorkspaceId(req, id);
    return this.serializeWorkspace(
      await this.service.patchSettings(workspaceId, (body || {}) as Record<string, unknown>),
    );
  }

  // Atualiza informações gerais da conta (nome, phone, timezone, webhook, notificações)
  @Post(':id/account')
  async setAccount(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: AccountUpdateBody,
  ) {
    const workspaceId = resolveWorkspaceId(req, id);
    return this.serializeWorkspace(
      await this.service.updateAccountSettings(workspaceId, body || {}),
    );
  }
}
