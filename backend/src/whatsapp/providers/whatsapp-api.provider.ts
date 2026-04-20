import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetaWhatsAppService } from '../../meta/meta-whatsapp.service';
import { PrismaService } from '../../prisma/prisma.service';
import { extractPhoneFromChatId as normalizePhoneFromChatId } from '../whatsapp-normalization.util';

/** Session status shape. */
export interface SessionStatus {
  /** Success property. */
  success: boolean;
  /** State property. */
  state: 'CONNECTED' | 'DISCONNECTED' | 'DEGRADED' | 'CONNECTION_INCOMPLETE' | null;
  /** Message property. */
  message: string;
  /** Phone number property. */
  phoneNumber?: string | null;
  /** Push name property. */
  pushName?: string | null;
  /** Self ids property. */
  selfIds?: string[];
}

/** Qr code response shape. */
export interface QrCodeResponse {
  /** Success property. */
  success: boolean;
  /** Qr property. */
  qr?: string;
  /** Message property. */
  message?: string;
}

/** Normalize waha session status. */
export function normalizeWahaSessionStatus(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null;
  }

  const normalized = raw.trim().toUpperCase();
  return normalized || null;
}

/** Map waha session status. */
export function mapWahaSessionStatus(rawStatus: string | null): SessionStatus['state'] {
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

/** Resolve waha session state. */
export function resolveWahaSessionState(data: Record<string, unknown> | null | undefined): {
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

/** Waha chat summary shape. */
export interface WahaChatSummary {
  /** Id property. */
  id: string;
  /** Unread count property. */
  unreadCount?: number;
  /** Timestamp property. */
  timestamp?: number;
  /** Last message timestamp property. */
  lastMessageTimestamp?: number;
  /** Last message recv timestamp property. */
  lastMessageRecvTimestamp?: number;
  /** Last message from me property. */
  lastMessageFromMe?: boolean | null;
  /** Name property. */
  name?: string | null;
  /** Contact property. */
  contact?: { pushName?: string; name?: string } | null;
  /** Push name property. */
  pushName?: string | null;
  /** Notify name property. */
  notifyName?: string | null;
  /** Last message property. */
  lastMessage?: {
    _data?: {
      notifyName?: string;
      verifiedBizName?: string;
    };
  } | null;
}

/** Waha chat message shape. */
export interface WahaChatMessage {
  /** Id property. */
  id: string;
  /** From property. */
  from?: string;
  /** To property. */
  to?: string;
  /** From me property. */
  fromMe?: boolean;
  /** Body property. */
  body?: string;
  /** Type property. */
  type?: string;
  /** Has media property. */
  hasMedia?: boolean;
  /** Media url property. */
  mediaUrl?: string;
  /** Mimetype property. */
  mimetype?: string;
  /** Timestamp property. */
  timestamp?: number;
  /** Chat id property. */
  chatId?: string;
  /** Raw property. */
  raw?: Record<string, unknown>;
}

/** Waha lid mapping shape. */
export interface WahaLidMapping {
  /** Lid property. */
  lid: string;
  /** Pn property. */
  pn: string;
}

/** Waha session overview shape. */
export interface WahaSessionOverview {
  /** Name property. */
  name: string;
  /** Success property. */
  success: boolean;
  /** Raw status property. */
  rawStatus: string;
  /** State property. */
  state: SessionStatus['state'];
  /** Phone number property. */
  phoneNumber?: string | null;
  /** Push name property. */
  pushName?: string | null;
}

/** Waha runtime config diagnostics shape. */
export interface WahaRuntimeConfigDiagnostics {
  /** Provider property. */
  provider: 'meta-cloud';
  /** Webhook configured property. */
  webhookConfigured: boolean;
  /** Inbound events configured property. */
  inboundEventsConfigured: boolean;
  /** Events property. */
  events: string[];
  /** Secret configured property. */
  secretConfigured: boolean;
  /** Store enabled property. */
  storeEnabled: boolean;
  /** Store full sync property. */
  storeFullSync: boolean;
  /** App id configured property. */
  appIdConfigured: boolean;
  /** App secret configured property. */
  appSecretConfigured: boolean;
  /** Access token configured property. */
  accessTokenConfigured: boolean;
  /** Phone number id configured property. */
  phoneNumberIdConfigured: boolean;
}

/** Waha session config diagnostics shape. */
export interface WahaSessionConfigDiagnostics {
  /** Session name property. */
  sessionName: string;
  /** Available property. */
  available: boolean;
  /** Raw status property. */
  rawStatus: string | null;
  /** State property. */
  state: SessionStatus['state'];
  /** Phone number property. */
  phoneNumber?: string | null;
  /** Push name property. */
  pushName?: string | null;
  /** Webhook configured property. */
  webhookConfigured: boolean;
  /** Inbound events configured property. */
  inboundEventsConfigured: boolean;
  /** Events property. */
  events: string[];
  /** Secret configured property. */
  secretConfigured: boolean;
  /** Store enabled property. */
  storeEnabled: boolean | null;
  /** Store full sync property. */
  storeFullSync: boolean | null;
  /** Config present property. */
  configPresent: boolean;
  /** Config mismatch property. */
  configMismatch?: boolean;
  /** Mismatch reasons property. */
  mismatchReasons?: string[];
  /** Session restart risk property. */
  sessionRestartRisk?: boolean;
  /** Error property. */
  error?: string;
  /** Auth url property. */
  authUrl?: string;
  /** Phone number id property. */
  phoneNumberId?: string;
  /** Whatsapp business id property. */
  whatsappBusinessId?: string | null;
}

/** Whats app api provider. */
@Injectable()
export class WhatsAppApiProvider {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly metaWhatsApp: MetaWhatsAppService,
  ) {}

  /** Get resolved session id. */
  getResolvedSessionId(workspaceId: string): string {
    return String(workspaceId || '').trim();
  }

  /** Get runtime config diagnostics. */
  getRuntimeConfigDiagnostics(): WahaRuntimeConfigDiagnostics {
    return {
      provider: 'meta-cloud',
      webhookConfigured: Boolean(
        String(process.env.META_APP_SECRET || '').trim() &&
        String(process.env.META_WEBHOOK_VERIFY_TOKEN || '').trim(),
      ),
      inboundEventsConfigured: true,
      events: ['messages', 'message_template_status_update', 'comments'],
      secretConfigured: Boolean(String(process.env.META_APP_SECRET || '').trim()),
      storeEnabled: true,
      storeFullSync: true,
      appIdConfigured: Boolean(String(process.env.META_APP_ID || '').trim()),
      appSecretConfigured: Boolean(String(process.env.META_APP_SECRET || '').trim()),
      accessTokenConfigured: Boolean(String(process.env.META_ACCESS_TOKEN || '').trim()),
      phoneNumberIdConfigured: Boolean(String(process.env.META_PHONE_NUMBER_ID || '').trim()),
    };
  }

  /** Ping. */
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

  /** Start session. */
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

  /** Restart session. */
  async restartSession(workspaceId: string): Promise<{
    success: boolean;
    message?: string;
    qrCode?: string;
    authUrl?: string;
  }> {
    return this.startSession(workspaceId);
  }

  /** Get session status. */
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

  /** Get qr code. */
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

  /** Terminate session. */
  terminateSession(workspaceId: string): Promise<{ success: boolean; message?: string }> {
    return Promise.resolve({
      success: true,
      message: `Meta connection for ${workspaceId} remains managed via Meta auth`,
    });
  }

  /** Logout session. */
  logoutSession(workspaceId: string): Promise<{ success: boolean; message?: string }> {
    return Promise.resolve({
      success: true,
      message: `Meta connection for ${workspaceId} remains managed via Meta auth`,
    });
  }

  // messageLimit: enforced via PlanLimitsService.trackMessageSend
  async sendMessage(
    workspaceId: string,
    to: string,
    message: string,
    options?: { quotedMessageId?: string },
  ) {
    const result = await this.metaWhatsApp.sendTextMessage(workspaceId, to, message, options);

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

  // messageLimit: enforced via PlanLimitsService.trackMessageSend
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

  /** Is registered user. */
  isRegisteredUser(_workspaceId: string, phone: string): Promise<boolean> {
    return Promise.resolve(normalizePhoneFromChatId(phone).length >= 10);
  }

  /** Get client info. */
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

  /** Get contacts. */
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

  /** Upsert contact profile. */
  async upsertContactProfile(
    workspaceId: string,
    contact: { phone: string; name?: string | null },
  ) {
    const normalizedPhone = normalizePhoneFromChatId(contact.phone);
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

  /** Get chats. */
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

  /** Get chat messages. */
  async getChatMessages(
    workspaceId: string,
    chatId: string,
    options?: { limit?: number; offset?: number; downloadMedia?: boolean },
  ): Promise<unknown[]> {
    const phone = normalizePhoneFromChatId(chatId);

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

  /** Read chat messages. */
  async readChatMessages(workspaceId: string, chatId: string): Promise<void> {
    const phone = normalizePhoneFromChatId(chatId);

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

    await this.prisma.conversation.updateMany({
      where: { id: conversation.id, workspaceId },
      data: { unreadCount: 0 },
    });
  }

  /** Set presence. */
  setPresence(
    _workspaceId: string,
    _presence: 'available' | 'offline',
    _chatId?: string,
  ): Promise<void> {
    return Promise.resolve();
  }

  /** Send typing. */
  sendTyping(_workspaceId: string, _chatId: string): Promise<void> {
    return Promise.resolve();
  }

  /** Stop typing. */
  stopTyping(_workspaceId: string, _chatId: string): Promise<void> {
    return Promise.resolve();
  }

  /** Send seen. */
  async sendSeen(workspaceId: string, chatId: string): Promise<void> {
    const phone = normalizePhoneFromChatId(chatId);

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
      await this.prisma.conversation.updateMany({
        where: { id: lastInbound.conversationId, workspaceId },
        data: { unreadCount: 0 },
      });
    }

    if (lastInbound?.externalId) {
      await this.metaWhatsApp.markMessageAsRead(workspaceId, lastInbound.externalId);
    }
  }

  /** Get session config diagnostics. */
  async getSessionConfigDiagnostics(workspaceId: string): Promise<WahaSessionConfigDiagnostics> {
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
      inboundEventsConfigured: this.getRuntimeConfigDiagnostics().inboundEventsConfigured,
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

  /** Sync session config. */
  syncSessionConfig(_workspaceId: string): Promise<void> {
    return Promise.resolve();
  }

  /** Delete session. */
  deleteSession(_workspaceId: string): Promise<boolean> {
    return Promise.resolve(true);
  }

  /** List lid mappings. */
  listLidMappings(_workspaceId: string): Promise<WahaLidMapping[]> {
    return Promise.resolve([]);
  }

  /** List sessions. */
  listSessions(): Promise<WahaSessionOverview[]> {
    const envPhoneNumberId = String(
      this.configService.get<string>('META_PHONE_NUMBER_ID') || '',
    ).trim();
    if (!envPhoneNumberId) {
      return Promise.resolve([]);
    }

    return Promise.resolve([
      {
        name: envPhoneNumberId,
        success: true,
        rawStatus: 'CONNECTED',
        state: 'CONNECTED',
      },
    ]);
  }
}
