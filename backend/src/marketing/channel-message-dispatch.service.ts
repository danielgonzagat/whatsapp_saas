/**
 * ChannelMessageDispatchService — the ONE canonical entrypoint for outbound
 * cross-channel message dispatch (Kloel OmniCore).
 *
 * PROBLEM this solves: `sendMessage` was only canonical for WhatsApp
 * (provider-registry → provider-registry-messaging → provider-send-message
 * helpers). Email / Instagram / Facebook / Messenger each had their own
 * ad-hoc send path, and every caller (controllers, autopilot, flow engine,
 * campaigns) had to (a) resolve per-channel credentials, then (b) hand-build
 * the channel-specific argument list. There was no single
 * `dispatch(workspaceId, channel, to, message, options)` surface.
 *
 * WHAT THIS IS: an ergonomic façade over the already-canonical
 * `ChannelDispatchRegistry` (ADR-0012 OmniCore Wave W1). Callers pass a
 * channel name + the universal `(workspaceId, to, message, options)` tuple;
 * this service resolves the channel's credentials (Meta connection token,
 * page id, IG account id) once, builds the correct discriminated
 * `ChannelSendInput`, and delegates to the registry. The registry then routes
 * to the EXISTING per-channel adapter, which delegates to the EXISTING
 * per-channel provider/service — nothing about sending is reimplemented here.
 *
 * Additive by design: existing callers and adapters keep working untouched;
 * this is the new preferred single front door.
 *
 * @cluster Marketing/Channels/Dispatch
 * @see backend/src/common/channel-dispatch/channel-dispatch.registry.ts
 * @see backend/src/common/channel-dispatch/channel-dispatch.port.ts
 * @see docs/adr/0012-kloel-omnicore-channel-unification.md
 */
import { Injectable, Logger } from '@nestjs/common';
import {
  ChannelKind,
  type ChannelSendInput,
  type ChannelSendResult,
} from '../common/channel-dispatch/channel-dispatch.port';
import { ChannelDispatchRegistry } from '../common/channel-dispatch/channel-dispatch.registry';
import { MetaWhatsAppService } from '../meta/meta-whatsapp.service';

/**
 * Channel selector accepted by {@link ChannelMessageDispatchService.dispatch}.
 * Accepts either the canonical {@link ChannelKind} enum value or its raw
 * string form so HTTP/JSON callers don't need to import the enum.
 */
export type DispatchChannel = ChannelKind | string;

/**
 * Options carried through to the resolved channel adapter. The optional
 * credential overrides (`igAccountId`, `pageId`, `accessToken`,
 * `pageAccessToken`) let a caller bypass automatic Meta-connection resolution
 * when it already holds a token; when omitted they are resolved per-workspace.
 */
export interface DispatchOptions {
  // WhatsApp media / threading
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
  caption?: string;
  quotedMessageId?: string;
  externalId?: string;
  complianceMode?: 'reactive' | 'proactive';
  forceDirect?: boolean;
  // Email
  subject?: string;
  html?: string;
  proactive?: boolean;
  // Meta credential overrides (auto-resolved per workspace when omitted)
  igAccountId?: string;
  pageId?: string;
  accessToken?: string;
  pageAccessToken?: string;
}

@Injectable()
export class ChannelMessageDispatchService {
  private readonly logger = new Logger(ChannelMessageDispatchService.name);

  constructor(
    private readonly registry: ChannelDispatchRegistry,
    private readonly metaWhatsApp: MetaWhatsAppService,
  ) {}

  /**
   * Canonical cross-channel send.
   *
   * @param workspaceId owning workspace (isolation boundary)
   * @param channel     channel selector (ChannelKind or its string form)
   * @param to          channel-native recipient (phone, PSID, IG user id, email)
   * @param message     message body (text, or email html when no opts.html)
   * @param options     channel-specific extras + credential overrides
   */
  async dispatch(
    workspaceId: string,
    channel: DispatchChannel,
    to: string,
    message: string,
    options?: DispatchOptions,
  ): Promise<ChannelSendResult> {
    const kind = this.normalizeChannel(channel);
    if (!kind) {
      return {
        success: false,
        error: `unknown_channel:${String(channel)}`,
        blocked: true,
        blockedReason: 'channel_not_supported',
      };
    }

    let input: ChannelSendInput;
    try {
      input = await this.buildInput(kind, workspaceId, to, message, options ?? {});
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'channel_setup_required';
      this.logger.warn(
        `dispatch blocked workspace=${workspaceId} channel=${kind} reason=${reason}`,
      );
      return {
        success: false,
        provider: kind,
        error: reason,
        blocked: true,
        blockedReason: reason,
      };
    }

    return this.registry.send(input);
  }

  
    /**
     * Canonical low-level send: dispatch a pre-built discriminated
     * {@link ChannelSendInput} straight to the registry's `sendMessage` (Wave 21
     * unification — task d). Use this when the caller already holds the channel
     * credentials / built the input; use {@link dispatch} for the ergonomic
     * `(workspaceId, channel, to, message, options)` tuple form.
     */
    sendMessage(input: ChannelSendInput): Promise<ChannelSendResult> {
      return this.registry.sendMessage(input);
    }

  /** Whether a channel has a registered, configured adapter for this workspace. */
  isConfigured(channel: DispatchChannel): boolean {
    const kind = this.normalizeChannel(channel);
    return kind ? this.registry.isConfigured(kind) : false;
  }

  /** Canonical list of channels with a registered dispatch adapter. */
  supportedChannels(): ChannelKind[] {
    return this.registry.listKinds();
  }

  /** Map a loose channel selector onto the canonical ChannelKind, or null. */
  private normalizeChannel(channel: DispatchChannel): ChannelKind | null {
    const raw = String(channel).trim().toLowerCase();
    switch (raw) {
      case 'whatsapp':
      case 'wa':
        return ChannelKind.WHATSAPP;
      case 'instagram':
      case 'ig':
        return ChannelKind.INSTAGRAM;
      case 'messenger':
        return ChannelKind.MESSENGER;
      case 'facebook':
      case 'fb':
        return ChannelKind.FACEBOOK;
      case 'email':
      case 'mail':
        return ChannelKind.EMAIL;
      default:
        return null;
    }
  }

  /**
   * Build the discriminated `ChannelSendInput` for the resolved channel,
   * resolving Meta credentials per-workspace when the caller did not supply
   * explicit overrides. Throws a domain reason string for honest blocked
   * results when required setup is missing.
   */
  private async buildInput(
    kind: ChannelKind,
    workspaceId: string,
    to: string,
    message: string,
    opts: DispatchOptions,
  ): Promise<ChannelSendInput> {
    switch (kind) {
      case ChannelKind.WHATSAPP:
        return this.buildWhatsApp(workspaceId, to, message, opts);
      case ChannelKind.INSTAGRAM:
        return this.buildInstagram(workspaceId, to, message, opts);
      case ChannelKind.MESSENGER:
        return this.buildMessenger(workspaceId, to, message, opts);
      case ChannelKind.FACEBOOK:
        return this.buildFacebook(workspaceId, to, message, opts);
      case ChannelKind.EMAIL:
        return this.buildEmail(workspaceId, to, message, opts);
      default:
        throw new Error('channel_not_supported');
    }
  }

  private buildWhatsApp(
    workspaceId: string,
    to: string,
    message: string,
    opts: DispatchOptions,
  ): ChannelSendInput {
    const input: ChannelSendInput = {
      channelKind: ChannelKind.WHATSAPP,
      workspaceId,
      to,
      message,
    };
    if (opts.mediaUrl !== undefined) {
      input.mediaUrl = opts.mediaUrl;
    }
    if (opts.mediaType !== undefined) {
      input.mediaType = opts.mediaType;
    }
    if (opts.caption !== undefined) {
      input.caption = opts.caption;
    }
    if (opts.quotedMessageId !== undefined) {
      input.quotedMessageId = opts.quotedMessageId;
    }
    if (opts.externalId !== undefined) {
      input.externalId = opts.externalId;
    }
    if (opts.complianceMode !== undefined) {
      input.complianceMode = opts.complianceMode;
    }
    if (opts.forceDirect !== undefined) {
      input.forceDirect = opts.forceDirect;
    }
    return input;
  }

  private async buildInstagram(
    workspaceId: string,
    to: string,
    message: string,
    opts: DispatchOptions,
  ): Promise<ChannelSendInput> {
    const conn = await this.metaWhatsApp.resolveConnection(workspaceId, 'instagram');
    const igAccountId = (opts.igAccountId || conn.instagramAccountId || '').trim();
    const accessToken = (opts.accessToken || conn.accessToken || '').trim();
    if (!accessToken) {
      throw new Error('meta_instagram_connection_required');
    }
    if (!igAccountId) {
      throw new Error('instagram_account_id_required');
    }
    return {
      channelKind: ChannelKind.INSTAGRAM,
      workspaceId,
      igAccountId,
      recipientId: to,
      text: message,
      accessToken,
    };
  }

  private async buildMessenger(
    workspaceId: string,
    to: string,
    message: string,
    opts: DispatchOptions,
  ): Promise<ChannelSendInput> {
    const conn = await this.metaWhatsApp.resolveConnection(workspaceId, 'facebook');
    const pageId = (opts.pageId || conn.pageId || '').trim();
    const pageAccessToken = (
      opts.pageAccessToken ||
      conn.pageAccessToken ||
      opts.accessToken ||
      conn.accessToken ||
      ''
    ).trim();
    if (!pageAccessToken) {
      throw new Error('meta_connection_required');
    }
    if (!pageId) {
      throw new Error('messenger_page_id_required');
    }
    const input: ChannelSendInput = {
      channelKind: ChannelKind.MESSENGER,
      workspaceId,
      pageId,
      recipientId: to,
      text: message,
      pageAccessToken,
    };
    if (opts.mediaUrl !== undefined) {
      input.mediaUrl = opts.mediaUrl;
    }
    if (opts.mediaType !== undefined) {
      input.mediaType = opts.mediaType;
    }
    return input;
  }

  private async buildFacebook(
    workspaceId: string,
    to: string,
    message: string,
    opts: DispatchOptions,
  ): Promise<ChannelSendInput> {
    const conn = await this.metaWhatsApp.resolveConnection(workspaceId, 'facebook');
    const pageId = (opts.pageId || conn.pageId || '').trim();
    const pageAccessToken = (
      opts.pageAccessToken ||
      conn.pageAccessToken ||
      opts.accessToken ||
      conn.accessToken ||
      ''
    ).trim();
    if (!pageAccessToken) {
      throw new Error('meta_connection_required');
    }
    if (!pageId) {
      throw new Error('facebook_page_id_required');
    }
    return {
      channelKind: ChannelKind.FACEBOOK,
      workspaceId,
      pageId,
      recipientPsid: to,
      text: message,
      pageAccessToken,
    };
  }

  /**
   * Resolver-shaped canonical alias for the capability registry.
   *
   * `KloelDomainServiceResolver` invokes every capability's `domainService`
   * with the `(workspaceId, args)` signature. This thin shim adapts that
   * convention onto {@link dispatch} without reimplementing any send — it just
   * unpacks the universal `(channel, to, message, options)` tuple from the
   * tool args and delegates. Honest blocked results bubble straight through
   * from {@link dispatch} (no fake success).
   *
   * @param workspaceId owning workspace (isolation boundary)
   * @param args        tool arguments: `{ channel?, to|recipient|phone|email, message, ...options }`
   */
  async dispatchTool(
    workspaceId: string,
    args: Record<string, unknown>,
  ): Promise<ChannelSendResult> {
    const channel = String(args.channel ?? '').trim();
    const to = String(
      args.to ?? args.recipient ?? args.phone ?? args.email ?? '',
    ).trim();
    const message = String(args.message ?? args.body ?? '').trim();
    if (!channel) {
      return {
        success: false,
        error: 'channel_required',
        blocked: true,
        blockedReason: 'channel_required',
      };
    }
    if (!to) {
      return {
        success: false,
        provider: channel,
        error: 'recipient_required',
        blocked: true,
        blockedReason: 'recipient_required',
      };
    }
    const options = this.extractOptions(args);
    return this.dispatch(workspaceId, channel, to, message, options);
  }

  /**
   * Honest setup-required result for ad-draft capabilities (Facebook/TikTok).
   *
   * There is NO real outbound ad-creation integration wired yet, so this
   * surface returns an explicit blocked/setup-required result instead of
   * faking a created draft. When the real Ads API adapter lands, this shim is
   * the single place to route it through.
   *
   * @param _workspaceId owning workspace (unused until a real adapter exists)
   * @param args         tool arguments carrying the requested ad platform
   */
  createAdDraftTool(
    _workspaceId: string,
    args: Record<string, unknown>,
  ): ChannelSendResult {
    const platform = String(args.platform ?? args.channel ?? 'ads').trim();
    return {
      success: false,
      provider: platform,
      error: 'ads_integration_setup_required',
      blocked: true,
      blockedReason: 'ads_integration_setup_required',
    };
  }

  /** Build {@link DispatchOptions} from loose tool args, dropping unset keys. */
  private extractOptions(args: Record<string, unknown>): DispatchOptions {
    const opts: DispatchOptions = {};
    const str = (v: unknown): string | undefined =>
      typeof v === 'string' && v !== '' ? v : undefined;
    const subject = str(args.subject);
    if (subject !== undefined) {
      opts.subject = subject;
    }
    const html = str(args.html);
    if (html !== undefined) {
      opts.html = html;
    }
    const mediaUrl = str(args.mediaUrl);
    if (mediaUrl !== undefined) {
      opts.mediaUrl = mediaUrl;
    }
    const caption = str(args.caption);
    if (caption !== undefined) {
      opts.caption = caption;
    }
    const externalId = str(args.externalId);
    if (externalId !== undefined) {
      opts.externalId = externalId;
    }
    return opts;
  }

  private buildEmail(
    workspaceId: string,
    to: string,
    message: string,
    opts: DispatchOptions,
  ): ChannelSendInput {
    const input: ChannelSendInput = {
      channelKind: ChannelKind.EMAIL,
      workspaceId,
      toEmail: to,
    };
    if (opts.subject !== undefined) {
      input.subject = opts.subject;
    }
    const html = opts.html ?? message;
    if (html !== undefined && html !== '') {
      input.html = html;
    }
    if (opts.proactive !== undefined) {
      input.proactive = opts.proactive;
    }
    return input;
  }
}
