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
import {
  resolveWhatsAppProvider,
  type ResolvedWhatsAppProvider,
} from '../whatsapp/providers/provider-env';
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
}

type NormalizedConnectionStatus =
  | 'connected'
  | 'connecting'
  | 'failed'
  | 'disconnected'
  | 'connection_incomplete';

type WhatsAppProviderType = ResolvedWhatsAppProvider;

function extractRawStatus(session: ProviderSessionSnapshot, settings: ProviderSettings): string {
  return String(session.rawStatus || session.status || settings.connectionStatus || '')
    .trim()
    .toUpperCase();
}

function extractPhoneNumberId(
  providerType: WhatsAppProviderType,
  session: ProviderSessionSnapshot,
): string | null {
  if (providerType !== 'meta-cloud') return null;
  const trimmed = String(session.phoneNumberId || '').trim();
  return trimmed || null;
}

function resolveWahaStatus(rawStatus: string): NormalizedConnectionStatus {
  if (rawStatus === 'CONNECTED' || rawStatus === 'WORKING') return 'connected';
  if (rawStatus === 'SCAN_QR_CODE' || rawStatus === 'STARTING' || rawStatus === 'OPENING') {
    return 'connecting';
  }
  if (rawStatus === 'FAILED') return 'failed';
  return 'disconnected';
}

function resolveMetaStatus(
  rawStatus: string,
  phoneNumberId: string | null,
): NormalizedConnectionStatus {
  if (rawStatus === 'CONNECTED' || rawStatus === 'WORKING') return 'connected';
  return phoneNumberId ? 'connection_incomplete' : 'disconnected';
}

function computeNormalizedStatus(
  providerType: WhatsAppProviderType,
  rawStatus: string,
  phoneNumberId: string | null,
): NormalizedConnectionStatus {
  if (providerType === 'whatsapp-api') return resolveWahaStatus(rawStatus);
  return resolveMetaStatus(rawStatus, phoneNumberId);
}

function metaDisconnectReason(phoneNumberId: string | null): string {
  return phoneNumberId ? 'meta_whatsapp_phone_number_id_missing' : 'meta_auth_required';
}

function wahaDisconnectReason(status: NormalizedConnectionStatus): string {
  if (status === 'connecting') return 'waha_qr_pending';
  if (status === 'failed') return 'waha_session_failed';
  return 'waha_session_disconnected';
}

function computeDisconnectReason(
  session: ProviderSessionSnapshot,
  providerType: WhatsAppProviderType,
  normalizedStatus: NormalizedConnectionStatus,
  phoneNumberId: string | null,
): string {
  const sessionReason = session.disconnectReason;
  if (typeof sessionReason === 'string' && sessionReason.trim()) {
    return sessionReason;
  }
  return providerType === 'meta-cloud'
    ? metaDisconnectReason(phoneNumberId)
    : wahaDisconnectReason(normalizedStatus);
}

function pickWahaQrCode(providerType: WhatsAppProviderType, qrCode: unknown): string | null {
  if (providerType !== 'whatsapp-api') return null;
  if (typeof qrCode !== 'string') return null;
  const trimmed = qrCode.trim();
  return trimmed ? qrCode : null;
}

function pickMetaAuthUrl(providerType: WhatsAppProviderType, authUrl: unknown): string | null {
  if (providerType !== 'meta-cloud') return null;
  if (typeof authUrl !== 'string') return null;
  const trimmed = authUrl.trim();
  return trimmed ? authUrl : null;
}

function resolveRawStatusFallback(
  rawStatus: string,
  providerType: WhatsAppProviderType,
  normalizedStatus: NormalizedConnectionStatus,
  phoneNumberId: string | null,
): string {
  if (rawStatus) return rawStatus;
  if (normalizedStatus === 'connected') return 'CONNECTED';
  if (providerType === 'meta-cloud' && phoneNumberId) return 'CONNECTION_INCOMPLETE';
  if (providerType === 'whatsapp-api' && normalizedStatus === 'connecting') return 'SCAN_QR_CODE';
  return 'DISCONNECTED';
}

interface BuildSnapshotParams {
  providerType: WhatsAppProviderType;
  session: ProviderSessionSnapshot;
  rawStatus: string;
  normalizedStatus: NormalizedConnectionStatus;
  phoneNumberId: string | null;
  disconnectReason: string;
  workspaceId: string;
}

function buildProviderSessionSnapshot(params: BuildSnapshotParams): ProviderSessionSnapshot {
  const {
    providerType,
    session,
    rawStatus,
    normalizedStatus,
    phoneNumberId,
    disconnectReason,
    workspaceId,
  } = params;

  return {
    qrCode: pickWahaQrCode(providerType, session.qrCode),
    status: normalizedStatus,
    authUrl: pickMetaAuthUrl(providerType, session.authUrl),
    selfIds: Array.isArray(session.selfIds) ? session.selfIds : [],
    provider: providerType,
    pushName: session.pushName || null,
    rawStatus: resolveRawStatusFallback(rawStatus, providerType, normalizedStatus, phoneNumberId),
    connectedAt: session.connectedAt || null,
    lastUpdated: session.lastUpdated || null,
    phoneNumber: session.phoneNumber || null,
    sessionName: String(session.sessionName || '').trim() || workspaceId,
    phoneNumberId,
    disconnectReason: normalizedStatus === 'connected' ? null : disconnectReason,
    whatsappBusinessId: providerType === 'meta-cloud' ? session.whatsappBusinessId || null : null,
  };
}
