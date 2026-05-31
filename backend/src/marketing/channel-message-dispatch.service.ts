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
 * @see backend/src/marketing/channel-message-dispatch.helpers.ts
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
import {
  buildEmail,
  buildFacebook,
  buildInstagram,
  buildMessenger,
  buildWhatsApp,
  coerceArgString,
  type DispatchChannel,
  type DispatchOptions,
  extractOptions,
  normalizeChannel,
} from './channel-message-dispatch.helpers';

export type { DispatchChannel, DispatchOptions } from './channel-message-dispatch.helpers';

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
    const kind = normalizeChannel(channel);
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
    const kind = normalizeChannel(channel);
    return kind ? this.registry.isConfigured(kind) : false;
  }

  /** Canonical list of channels with a registered dispatch adapter. */
  supportedChannels(): ChannelKind[] {
    return this.registry.listKinds();
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
        return buildWhatsApp(workspaceId, to, message, opts);
      case ChannelKind.INSTAGRAM: {
        const conn = await this.metaWhatsApp.resolveConnection(workspaceId, 'instagram');
        return buildInstagram(workspaceId, to, message, opts, conn);
      }
      case ChannelKind.MESSENGER: {
        const conn = await this.metaWhatsApp.resolveConnection(workspaceId, 'facebook');
        return buildMessenger(workspaceId, to, message, opts, conn);
      }
      case ChannelKind.FACEBOOK: {
        const conn = await this.metaWhatsApp.resolveConnection(workspaceId, 'facebook');
        return buildFacebook(workspaceId, to, message, opts, conn);
      }
      case ChannelKind.EMAIL:
        return buildEmail(workspaceId, to, message, opts);
      default:
        throw new Error('channel_not_supported');
    }
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
    const channel = coerceArgString(args.channel);
    const to = coerceArgString(args.to ?? args.recipient ?? args.phone ?? args.email);
    const message = coerceArgString(args.message ?? args.body);
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
    const options = extractOptions(args);
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
  createAdDraftTool(_workspaceId: string, args: Record<string, unknown>): ChannelSendResult {
    const platform = coerceArgString(args.platform ?? args.channel, 'ads');
    return {
      success: false,
      provider: platform,
      error: 'ads_integration_setup_required',
      blocked: true,
      blockedReason: 'ads_integration_setup_required',
    };
  }
}
