import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { MetaWhatsAppService } from '../../meta/meta-whatsapp.service';

export interface SessionStatus {
  success: boolean;
  state:
    | 'CONNECTED'
    | 'DISCONNECTED'
    | 'DEGRADED'
    | 'CONNECTION_INCOMPLETE'
    | null;
  message: string;
  phoneNumber?: string | null;
  pushName?: string | null;
  selfIds?: string[];
}

export interface QrCodeResponse {
  success: boolean;
  qr?: string;
  message?: string;
}

export function normalizeWahaSessionStatus(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null;
  }

  const normalized = raw.trim().toUpperCase();
  return normalized || null;
}

export function mapWahaSessionStatus(
  rawStatus: string | null,
): SessionStatus['state'] {
  switch (rawStatus) {
    case 'CONNECTED':
      return 'CONNECTED';
    case 'CONNECTION_INCOMPLETE':
      return 'CONNECTION_INCOMPLETE';
    case 'DEGRADED':
      return 'DEGRADED';
    case 'DISCONNECTED':
      return 'DISCONNECTED';
    default:
      return null;
  }
}

export function resolveWahaSessionState(data: any): {
  rawStatus: string;
  state: SessionStatus['state'];
} {
  const rawStatus = normalizeWahaSessionStatus(
    data?.state || data?.status || data?.rawStatus || 'DISCONNECTED',
  );

  return {
    rawStatus: rawStatus || 'DISCONNECTED',
    state: mapWahaSessionStatus(rawStatus || 'DISCONNECTED'),
  };
}

export interface WahaChatSummary {
  id: string;
  unreadCount?: number;
  timestamp?: number;
  lastMessageTimestamp?: number;
  lastMessageRecvTimestamp?: number;
  lastMessageFromMe?: boolean | null;
  name?: string | null;
  contact?: { pushName?: string; name?: string } | null;
  pushName?: string | null;
  notifyName?: string | null;
  lastMessage?: {
    _data?: {
      notifyName?: string;
      verifiedBizName?: string;
    };
  } | null;
}

export interface WahaChatMessage {
  id: string;
  from?: string;
  to?: string;
  fromMe?: boolean;
  body?: string;
  type?: string;
  hasMedia?: boolean;
  mediaUrl?: string;
  mimetype?: string;
  timestamp?: number;
  chatId?: string;
  raw?: any;
}

export interface WahaLidMapping {
  lid: string;
  pn: string;
}

export interface WahaSessionOverview {
  name: string;
  success: boolean;
  rawStatus: string;
  state: SessionStatus['state'];
  phoneNumber?: string | null;
  pushName?: string | null;
}

export interface WahaRuntimeConfigDiagnostics {
  provider: 'meta-cloud';
  webhookConfigured: boolean;
  inboundEventsConfigured: boolean;
  events: string[];
  secretConfigured: boolean;
  storeEnabled: boolean;
  storeFullSync: boolean;
  appIdConfigured: boolean;
  appSecretConfigured: boolean;
  accessTokenConfigured: boolean;
  phoneNumberIdConfigured: boolean;
}

export interface WahaSessionConfigDiagnostics {
  sessionName: string;
  available: boolean;
  rawStatus: string | null;
  state: SessionStatus['state'];
  phoneNumber?: string | null;
  pushName?: string | null;
  webhookConfigured: boolean;
  inboundEventsConfigured: boolean;
  events: string[];
  secretConfigured: boolean;
  storeEnabled: boolean | null;
  storeFullSync: boolean | null;
  configPresent: boolean;
  configMismatch?: boolean;
  mismatchReasons?: string[];
  sessionRestartRisk?: boolean;
  error?: string;
  authUrl?: string;
  phoneNumberId?: string;
  whatsappBusinessId?: string | null;
}

@Injectable()
export class WhatsAppApiProvider {
  private readonly logger = new Logger(WhatsAppApiProvider.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly metaWhatsApp: MetaWhatsAppService,
  ) {}

  getResolvedSessionId(workspaceId: string): string {
    return String(workspaceId || '').trim();
  }

  getRuntimeConfigDiagnostics(): WahaRuntimeConfigDiagnostics {
    return {
      provider: 'meta-cloud',
      webhookConfigured: Boolean(
        String(process.env.META_APP_SECRET || '').trim() &&
        String(process.env.META_WEBHOOK_VERIFY_TOKEN || '').trim(),
      ),
      inboundEventsConfigured: true,
      events: ['messages', 'message_template_status_update', 'comments'],
      secretConfigured: Boolean(
        String(process.env.META_APP_SECRET || '').trim(),
      ),
      storeEnabled: true,
      storeFullSync: true,
      appIdConfigured: Boolean(String(process.env.META_APP_ID || '').trim()),
      appSecretConfigured: Boolean(
        String(process.env.META_APP_SECRET || '').trim(),
      ),
      accessTokenConfigured: Boolean(
        String(process.env.META_ACCESS_TOKEN || '').trim(),
      ),
      phoneNumberIdConfigured: Boolean(
        String(process.env.META_PHONE_NUMBER_ID || '').trim(),
      ),
    };
  }

  async ping(): Promise<boolean> {
    const workspace = await this.prisma.workspace.findFirst({
      where: {
        providerSettings: {
          path: ['whatsappProvider'],
          equals: 'meta-cloud',
        },
      },
      select: { id: true },
    });

    const workspaceId = workspace?.id || 'default';
    const status = await this.metaWhatsApp.getPhoneNumberDetails(workspaceId);
    return status.connected || Boolean(status.phoneNumberId);
  }

  async startSession(workspaceId: string): Promise<{
    success: boolean;
    qrCode?: string;
    message?: string;
    authUrl?: string;
  }> {
    const status = await this.metaWhatsApp.getPhoneNumberDetails(workspaceId);

    if (status.connected) {
      return {
        success: true,
        message: 'already_connected',
      };
    }

    return {
      success: true,
      message: status.degradedReason || 'meta_connection_required',
      authUrl: status.authUrl,
    };
  }

  async restartSession(workspaceId: string): Promise<{
    success: boolean;
    message?: string;
    qrCode?: string;
    authUrl?: string;
  }> {
    return this.startSession(workspaceId);
  }

  async getSessionStatus(workspaceId: string): Promise<SessionStatus> {
    const details = await this.metaWhatsApp.getPhoneNumberDetails(workspaceId);
    const state: SessionStatus['state'] = details.connected
      ? 'CONNECTED'
      : details.status === 'CONNECTION_INCOMPLETE'
        ? 'CONNECTION_INCOMPLETE'
        : details.status === 'DEGRADED'
          ? 'DEGRADED'
          : 'DISCONNECTED';

    return {
      success: true,
      state,
      message: details.degradedReason || details.status,
      phoneNumber: details.phoneNumber || null,
      pushName: details.pushName || null,
      selfIds: details.selfIds || [],
    };
  }

  async getQrCode(workspaceId: string): Promise<QrCodeResponse> {
    const details = await this.metaWhatsApp.getPhoneNumberDetails(workspaceId);
    return {
      success: true,
      message: details.connected
        ? 'meta_cloud_connected'
        : details.authUrl
          ? 'meta_cloud_use_embedded_signup'
          : 'meta_cloud_has_no_qr',
    };
  }

  async terminateSession(
    workspaceId: string,
  ): Promise<{ success: boolean; message?: string }> {
    return {
      success: true,
      message: `Meta connection for ${workspaceId} remains managed via Meta auth`,
    };
  }

  async logoutSession(
    workspaceId: string,
  ): Promise<{ success: boolean; message?: string }> {
    return {
      success: true,
      message: `Meta connection for ${workspaceId} remains managed via Meta auth`,
    };
  }

  async sendMessage(
    workspaceId: string,
    to: string,
    message: string,
    options?: { quotedMessageId?: string },
  ) {
    const result = await this.metaWhatsApp.sendTextMessage(
      workspaceId,
      to,
      message,
      options,
    );

    if (!result.success) {
      throw new Error(result.error || 'meta_send_failed');
    }

    return {
      success: true,
      message: {
        id: result.messageId,
      },
    };
  }

  async sendMediaFromUrl(
    workspaceId: string,
    to: string,
    mediaUrl: string,
    caption?: string,
    mediaType: 'image' | 'video' | 'audio' | 'document' = 'image',
    options?: { quotedMessageId?: string },
  ) {
    const result = await this.metaWhatsApp.sendMediaMessage(
      workspaceId,
      to,
      mediaType,
      mediaUrl,
      caption,
      options,
    );

    if (!result.success) {
      throw new Error(result.error || 'meta_send_media_failed');
    }

    return {
      success: true,
      message: {
        id: result.messageId,
      },
    };
  }

  async isRegisteredUser(
    _workspaceId: string,
    phone: string,
  ): Promise<boolean> {
    return String(phone || '').replace(/\D/g, '').length >= 10;
  }

  async getClientInfo(workspaceId: string): Promise<unknown> {
    const details = await this.metaWhatsApp.getPhoneNumberDetails(workspaceId);
    return {
      provider: 'meta-cloud',
      connected: details.connected,
      phoneNumber: details.phoneNumber || null,
      pushName: details.pushName || null,
      phoneNumberId: details.phoneNumberId || null,
      whatsappBusinessId: details.whatsappBusinessId || null,
      instagramAccountId: details.instagramAccountId || null,
      instagramUsername: details.instagramUsername || null,
    };
  }

  async getContacts(workspaceId: string): Promise<unknown[]> {
    const contacts = await this.prisma.contact.findMany({
      take: 500,
      where: { workspaceId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        phone: true,
        name: true,
        email: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return contacts.map((contact) => ({
      id: `${contact.phone}@s.whatsapp.net`,
      phone: contact.phone,
      name: contact.name || null,
      pushName: contact.name || null,
      email: contact.email || null,
      source: 'crm',
      createdAt: contact.createdAt.toISOString(),
      updatedAt: contact.updatedAt.toISOString(),
    }));
  }

  async upsertContactProfile(
    workspaceId: string,
    contact: { phone: string; name?: string | null },
  ) {
    const normalizedPhone = String(contact.phone || '').replace(/\D/g, '');
    if (!normalizedPhone) {
      return false;
    }

    await this.prisma.contact.upsert({
      where: {
        workspaceId_phone: {
          workspaceId,
          phone: normalizedPhone,
        },
      },
      update: {
        ...(contact.name ? { name: contact.name } : {}),
      },
      create: {
        workspaceId,
        phone: normalizedPhone,
        name: contact.name || null,
      },
    });

    return true;
  }

  async getChats(workspaceId: string): Promise<unknown[]> {
    const conversations = await this.prisma.conversation.findMany({
      take: 500,
      where: { workspaceId, channel: 'WHATSAPP' },
      orderBy: { lastMessageAt: 'desc' },
      select: {
        id: true,
        unreadCount: true,
        lastMessageAt: true,
        contact: {
          select: {
            phone: true,
            name: true,
          },
        },
      },
    });

    return conversations.map((conversation) => {
      const phone = String(conversation.contact?.phone || '').trim();
      const chatId = phone ? `${phone}@s.whatsapp.net` : conversation.id;
      const timestamp = conversation.lastMessageAt?.getTime?.() || Date.now();
      return {
        id: chatId,
        phone,
        name: conversation.contact?.name || phone || null,
        unreadCount: conversation.unreadCount || 0,
        timestamp,
        lastMessageAt: conversation.lastMessageAt?.toISOString?.() || null,
        source: 'crm',
      };
    });
  }

  async getChatMessages(
    workspaceId: string,
    chatId: string,
    options?: { limit?: number; offset?: number; downloadMedia?: boolean },
  ): Promise<unknown[]> {
    const phone = String(chatId || '')
      .replace(/@.*$/, '')
      .replace(/\D/g, '');

    if (!phone) {
      return [];
    }

    const contact = await this.prisma.contact.findUnique({
      where: {
        workspaceId_phone: {
          workspaceId,
          phone,
        },
      },
      select: { id: true },
    });

    if (!contact) {
      return [];
    }

    const messages = await this.prisma.message.findMany({
      take: Math.max(1, Math.min(200, Number(options?.limit || 100) || 100)),
      skip: Math.max(0, Number(options?.offset || 0) || 0),
      where: {
        workspaceId,
        contactId: contact.id,
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        content: true,
        direction: true,
        status: true,
        createdAt: true,
        mediaUrl: true,
        externalId: true,
        type: true,
      },
    });

    return messages.map((message) => ({
      id: message.externalId || message.id,
      chatId: `${phone}@s.whatsapp.net`,
      phone,
      body: message.content || '',
      direction: message.direction,
      fromMe: message.direction === 'OUTBOUND',
      type: String(message.type || 'TEXT').toLowerCase(),
      hasMedia: Boolean(message.mediaUrl),
      mediaUrl: message.mediaUrl || null,
      timestamp: message.createdAt.getTime(),
      isoTimestamp: message.createdAt.toISOString(),
      source: 'crm',
      status: message.status || null,
    }));
  }

  async readChatMessages(workspaceId: string, chatId: string): Promise<void> {
    const phone = String(chatId || '')
      .replace(/@.*$/, '')
      .replace(/\D/g, '');

    if (!phone) {
      return;
    }

    const conversation = await this.prisma.conversation.findFirst({
      where: {
        workspaceId,
        channel: 'WHATSAPP',
        contact: { phone },
      },
      select: { id: true },
    });

    if (!conversation) {
      return;
    }

    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { unreadCount: 0 },
    });
  }

  async setPresence(
    _workspaceId: string,
    _presence: 'available' | 'offline',
    _chatId?: string,
  ): Promise<void> {
    return;
  }

  async sendTyping(_workspaceId: string, _chatId: string): Promise<void> {
    return;
  }

  async stopTyping(_workspaceId: string, _chatId: string): Promise<void> {
    return;
  }

  async sendSeen(workspaceId: string, chatId: string): Promise<void> {
    const phone = String(chatId || '')
      .replace(/@.*$/, '')
      .replace(/\D/g, '');

    if (!phone) {
      return;
    }

    const contact = await this.prisma.contact.findUnique({
      where: {
        workspaceId_phone: {
          workspaceId,
          phone,
        },
      },
      select: { id: true },
    });

    if (!contact) {
      return;
    }

    const lastInbound = await this.prisma.message.findFirst({
      where: {
        workspaceId,
        contactId: contact.id,
        direction: 'INBOUND',
      },
      orderBy: { createdAt: 'desc' },
      select: { externalId: true, conversationId: true },
    });

    if (lastInbound?.conversationId) {
      await this.prisma.conversation.update({
        where: { id: lastInbound.conversationId },
        data: { unreadCount: 0 },
      });
    }

    if (lastInbound?.externalId) {
      await this.metaWhatsApp.markMessageAsRead(
        workspaceId,
        lastInbound.externalId,
      );
    }
  }

  async getSessionConfigDiagnostics(
    workspaceId: string,
  ): Promise<WahaSessionConfigDiagnostics> {
    const details = await this.metaWhatsApp.getPhoneNumberDetails(workspaceId);

    return {
      sessionName: this.getResolvedSessionId(workspaceId),
      available: true,
      rawStatus: details.status || null,
      state: details.connected
        ? 'CONNECTED'
        : details.status === 'CONNECTION_INCOMPLETE'
          ? 'CONNECTION_INCOMPLETE'
          : details.status === 'DEGRADED'
            ? 'DEGRADED'
            : 'DISCONNECTED',
      phoneNumber: details.phoneNumber || null,
      pushName: details.pushName || null,
      webhookConfigured: this.getRuntimeConfigDiagnostics().webhookConfigured,
      inboundEventsConfigured:
        this.getRuntimeConfigDiagnostics().inboundEventsConfigured,
      events: this.getRuntimeConfigDiagnostics().events,
      secretConfigured: this.getRuntimeConfigDiagnostics().secretConfigured,
      storeEnabled: true,
      storeFullSync: true,
      configPresent: Boolean(details.phoneNumberId),
      configMismatch: false,
      mismatchReasons: [],
      sessionRestartRisk: false,
      error: details.degradedReason || undefined,
      authUrl: details.authUrl,
      phoneNumberId: details.phoneNumberId,
      whatsappBusinessId: details.whatsappBusinessId,
    };
  }

  async syncSessionConfig(_workspaceId: string): Promise<void> {
    return;
  }

  async deleteSession(_workspaceId: string): Promise<boolean> {
    return true;
  }

  async listLidMappings(_workspaceId: string): Promise<WahaLidMapping[]> {
    return [];
  }

  async listSessions(): Promise<WahaSessionOverview[]> {
    const envPhoneNumberId = String(
      this.configService.get<string>('META_PHONE_NUMBER_ID') || '',
    ).trim();
    if (!envPhoneNumberId) {
      return [];
    }

    return [
      {
        name: envPhoneNumberId,
        success: true,
        rawStatus: 'CONNECTED',
        state: 'CONNECTED',
      },
    ];
  }
}
