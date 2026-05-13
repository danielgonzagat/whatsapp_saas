import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MetaWhatsAppService } from '../../meta/meta-whatsapp.service';
import { MetaConnectionStateService } from '../../meta/meta-connection-state.service';
import { WhatsAppProviderRegistry } from '../../whatsapp/providers/provider-registry';
import { asProviderSettings, type ProviderSettings } from '../../whatsapp/provider-settings.types';
import { readOptionalText, type WhatsAppStatusValue } from './shared/channel-helpers';

@Injectable()
export class MetaConnectService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metaWhatsApp: MetaWhatsAppService,
    private readonly metaConnectionState: MetaConnectionStateService,
    private readonly whatsappProviders: WhatsAppProviderRegistry,
  ) {}

  private getWhatsAppSessionSnapshot(providerSettings: ProviderSettings) {
    const snapshot = providerSettings.whatsappApiSession ?? {};
    const rawSnapshotStatus =
      typeof snapshot.rawStatus === 'string'
        ? snapshot.rawStatus
        : typeof snapshot.status === 'string'
          ? snapshot.status
          : '';
    const snapshotStatus = rawSnapshotStatus.trim().toLowerCase();
    const snapshotConnected = snapshotStatus === 'connected' || snapshotStatus === 'working';

    return { snapshot, snapshotStatus, snapshotConnected };
  }

  async getStatus(workspaceId: string) {
    const [workspace, metaConnection, metaState, providerType, whatsappStatus] = await Promise.all([
      this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { providerSettings: true },
      }),
      this.prisma.metaConnection.findFirst({
        where: { workspaceId },
        select: {
          status: true,
          pageId: true,
          pageName: true,
          instagramAccountId: true,
          instagramUsername: true,
          whatsappPhoneNumberId: true,
          whatsappBusinessId: true,
          adAccountId: true,
          tokenExpiresAt: true,
          updatedAt: true,
        },
      }),
      this.metaConnectionState.forWorkspace(workspaceId),
      this.whatsappProviders.getProviderType(workspaceId).catch(() => 'meta-cloud' as const),
      this.whatsappProviders.getSessionStatus(workspaceId).catch(() => null),
    ]);

    const providerSettings = asProviderSettings(workspace?.providerSettings);
    const safeWhatsApp = whatsappStatus ?? ({} as WhatsAppStatusValue);
    const { snapshot, snapshotStatus, snapshotConnected } =
      this.getWhatsAppSessionSnapshot(providerSettings);
    const rawLiveStatus =
      typeof safeWhatsApp.status === 'string'
        ? safeWhatsApp.status
        : snapshotStatus || 'DISCONNECTED';
    const liveStatus = rawLiveStatus.trim().toLowerCase();
    const whatsappConnected = Boolean(safeWhatsApp.connected) || snapshotConnected;
    const whatsappStatusValue =
      providerType === 'whatsapp-api'
        ? whatsappConnected
          ? 'connected'
          : liveStatus === 'scan_qr_code' || liveStatus === 'starting' || liveStatus === 'opening'
            ? 'connecting'
            : liveStatus === 'failed'
              ? 'failed'
              : liveStatus || snapshotStatus || 'disconnected'
        : whatsappConnected
          ? 'connected'
          : liveStatus === 'connection_incomplete'
            ? 'connection_incomplete'
            : liveStatus || snapshotStatus || 'disconnected';

    return {
      meta: {
        connected: metaState.metaConnected,
        tokenExpired: Boolean(
          metaConnection?.tokenExpiresAt &&
          new Date(metaConnection.tokenExpiresAt).getTime() < Date.now(),
        ),
        pageId: metaConnection?.pageId || null,
        pageName: metaConnection?.pageName || null,
        instagramUsername: metaConnection?.instagramUsername || null,
        updatedAt: metaConnection?.updatedAt || null,
      },
      whatsapp: {
        provider: providerType,
        connected: whatsappConnected,
        status: whatsappStatusValue,
        authUrl:
          providerType === 'meta-cloud'
            ? safeWhatsApp.authUrl ||
              snapshot.authUrl ||
              this.metaWhatsApp.safeBuildEmbeddedSignupUrl(workspaceId, {
                channel: 'whatsapp',
                returnTo: '/marketing/whatsapp',
              })
            : null,
        phoneNumberId:
          providerType === 'meta-cloud'
            ? safeWhatsApp.phoneNumberId || snapshot.phoneNumberId || null
            : null,
        whatsappBusinessId:
          providerType === 'meta-cloud'
            ? safeWhatsApp.whatsappBusinessId || snapshot.whatsappBusinessId || null
            : null,
        phoneNumber:
          readOptionalText(safeWhatsApp.phoneNumber) ||
          readOptionalText((safeWhatsApp as Record<string, unknown>).phone) ||
          readOptionalText(snapshot.phoneNumber),
        pushName: readOptionalText(safeWhatsApp.pushName) || readOptionalText(snapshot.pushName),
        degradedReason:
          whatsappConnected || whatsappStatusValue === 'connecting'
            ? null
            : readOptionalText(safeWhatsApp.degradedReason) ||
              readOptionalText((safeWhatsApp as Record<string, unknown>).message) ||
              readOptionalText(snapshot.disconnectReason),
      },
      instagram: {
        connected: metaState.instagram.connected,
        status: metaState.instagram.connected ? 'connected' : 'disconnected',
        authUrl: this.metaWhatsApp.safeBuildEmbeddedSignupUrl(workspaceId, {
          channel: 'instagram',
          returnTo: '/marketing/instagram',
        }),
        instagramAccountId: metaConnection?.instagramAccountId || null,
        username: metaConnection?.instagramUsername || null,
        pageName: metaConnection?.pageName || null,
      },
      facebook: {
        connected: metaState.facebook.connected,
        status: metaState.facebook.connected ? 'connected' : 'disconnected',
        authUrl: this.metaWhatsApp.safeBuildEmbeddedSignupUrl(workspaceId, {
          channel: 'facebook',
          returnTo: '/marketing/facebook',
        }),
        pageId: metaConnection?.pageId || null,
        pageName: metaConnection?.pageName || null,
      },
    };
  }
}
