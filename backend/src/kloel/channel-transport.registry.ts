import { forwardRef, Inject, Injectable, Optional } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import {
  EmailChannelTransport,
  InstagramChannelTransport,
  MessengerChannelTransport,
  TikTokChannelTransport,
  WhatsAppChannelTransport,
} from './channel-transport.providers';
import type {
  ChannelCapability,
  ChannelName,
  ChannelSendRequest,
  ChannelSendResult,
  ChannelTransportProvider,
} from './channel-transport.types';
import { MindGuardsService } from './mind/policy/mind-guards.service';
import { MindGuardContextBuilderService } from './mind/policy/mind-guard-context-builder.service';
import type { MindActionContext } from './mind/policy/mind-code-native.types';
import { ChannelMessageDispatchService } from '../marketing/channel-message-dispatch.service';
import type {
  ChannelSendInput,
  ChannelSendResult as CanonicalChannelSendResult,
} from '../common/channel-dispatch/channel-dispatch.port';
import {
  buildInstagram,
  buildMessenger,
  buildWhatsApp,
  type DispatchOptions,
  type ResolvedMetaConnectionLike,
} from '../marketing/channel-message-dispatch.helpers';
import { MetaWhatsAppService } from '../meta/meta-whatsapp.service';
import { isTransportCanonicalDelegateEnabled } from './channel-transport-canonical-delegate.flag';

/**
 * ChannelTransportRegistry — the MindGuard-wrapped outbound send registry for
 * the Kloel agent/inbox/webhook layer. It resolves a {@link
 * ChannelTransportProvider} by {@link ChannelName} and runs the
 * `send_message` policy guard ({@link MindGuardsService}) + structured audit
 * logging before delegating to the provider (which owns rate-limit /
 * idempotency / dedup at the WhatsApp/Email/Meta provider boundary).
 *
 * Channel-vocabulary canonicalization (OmniCore W3): {@link ChannelName} is no
 * longer an independent string union — it is the message-dispatchable subset of
 * the single canonical {@link CanonicalChannelName}/`ChannelKind`
 * (`common/channel-dispatch/channel-dispatch.port`). The pure-port
 * {@link ChannelDispatchRegistry} (marketing layer, no guard) and this guarded
 * transport registry therefore now speak ONE channel vocabulary; the two are
 * NOT duplicate enums — they are two layers over the same `ChannelKind`.
 */
@Injectable()
export class ChannelTransportRegistry {
  private readonly logger = StructuredLogger.from(ChannelTransportRegistry.name);
  private readonly providers = new Map<ChannelName, ChannelTransportProvider>();

  constructor(
    @Optional() instagram?: InstagramChannelTransport,
    @Optional() messenger?: MessengerChannelTransport,
    @Optional() tiktok?: TikTokChannelTransport,
    @Optional() email?: EmailChannelTransport,
    @Optional() whatsapp?: WhatsAppChannelTransport,
    @Optional() private readonly guards?: MindGuardsService,
    @Optional() private readonly guardContextBuilder?: MindGuardContextBuilderService,
    @Optional()
    @Inject(forwardRef(() => ChannelMessageDispatchService))
    private readonly canonicalDispatch?: ChannelMessageDispatchService,
    @Optional()
    @Inject(forwardRef(() => MetaWhatsAppService))
    private readonly metaConnection?: MetaWhatsAppService,
  ) {
    [instagram, messenger, tiktok, email, whatsapp].forEach((provider) => {
      if (provider) {
        this.register(provider);
      }
    });
  }

  register(provider: ChannelTransportProvider): void {
    if (this.providers.has(provider.channel)) {
      this.logger.warn(`Provider duplicado para canal ${provider.channel} — substituindo anterior`);
    }
    this.providers.set(provider.channel, provider);
    this.logger.log(
      `Provider registrado para canal ${provider.channel} — configurado=${provider.isConfigured()}`,
    );
  }

  getAllCapabilities(workspaceId: string): Promise<ChannelCapability[]> {
    const channels: ChannelName[] = ['whatsapp', 'instagram', 'messenger', 'tiktok', 'email'];

    return Promise.all(channels.map((channel) => this.getCapability(workspaceId, channel)));
  }

  async getCapability(workspaceId: string, channel: ChannelName): Promise<ChannelCapability> {
    const provider = this.providers.get(channel);
    if (!provider) {
      return {
        channel,
        sendAvailable: false,
        sendBlockedReason: `Nenhum provider registrado para o canal ${channel}`,
        requiredSetup: [],
      };
    }
    return provider.capability(workspaceId);
  }

  async send(workspaceId: string, request: ChannelSendRequest): Promise<ChannelSendResult> {
    const provider = this.providers.get(request.channel);
    if (!provider) {
      return {
        success: false,
        blocked: true,
        blockedReason: `Nenhum provider registrado para o canal ${request.channel}`,
      };
    }

    if (!provider.isConfigured()) {
      return {
        success: false,
        blocked: true,
        blockedReason: `Provider para ${request.channel} nao esta configurado`,
      };
    }

    const guardContext = await this.buildGuardContext(workspaceId, request);
    const guard = await this.guards?.evaluate({
      workspaceId,
      decisionType: 'send_message',
      action: this.guardAction(request),
      context: guardContext,
    });
    if (guard && !guard.allowed) {
      this.logger.warn(
        `Envio bloqueado por guarda ${guard.guardName} workspace=${workspaceId} channel=${request.channel}`,
      );
      return {
        success: false,
        blocked: true,
        blockedReason: guard.reason,
      };
    }

    this.logger.log(
      `Enviando mensagem via ${request.channel} workspace=${workspaceId} recipient=${request.recipientId}`,
    );

    if (isTransportCanonicalDelegateEnabled() && this.canDelegate(request.channel)) {
      const delegated = await this.sendViaCanonical(workspaceId, request);
      if (delegated) {
        return delegated;
      }
    }

    return provider.send(workspaceId, request);
  }

  /**
   * Channels that may delegate to the canonical
   * {@link ChannelMessageDispatchService} when
   * `KLOEL_TRANSPORT_CANONICAL_DELEGATE` is on.
   *
   * Email is intentionally EXCLUDED: the canonical `EmailDispatchAdapter` is a
   * connected-mailbox send (Gmail / Microsoft / IMAP-SMTP), a DIFFERENT delivery
   * mechanism than this layer's `EmailCampaignService` (Resend / SendGrid /
   * env-SMTP) path — delegating it would change behavior. TikTok has no
   * canonical outbound builder either, so it stays on the current (blocked)
   * provider path.
   */
  private canDelegate(channel: ChannelName): boolean {
    return channel === 'whatsapp' || channel === 'instagram' || channel === 'messenger';
  }

  /**
   * Build the canonical discriminated {@link ChannelSendInput} from a transport
   * {@link ChannelSendRequest} and delegate to
   * {@link ChannelMessageDispatchService.sendMessage}, mapping the canonical
   * CONTRACT-B result back to the transport CONTRACT-A
   * ({@link ChannelSendResult} — `blocked` REQUIRED). Returns `null` when the
   * input cannot be built (e.g. canonical service not injected, or a Meta
   * channel without a resolvable connection) so the caller falls back to the
   * existing provider path with identical behavior.
   *
   * A thrown error from the canonical path (e.g. the WhatsApp dispatcher's
   * subscription/opt-in checks, or an adapter failing at runtime) is caught and
   * mapped to the transport soft-failure contract
   * (`{ success: false, blocked: false, error }`) — mirroring how every
   * non-delegate provider translates a throw, and preserving the documented
   * `ChannelSendResult` contract the ~16 inbox/cart-recovery/agent callers rely
   * on. Real opt-in/subscription BLOCKS are surfaced as a RETURNED
   * `blocked: true` result by the canonical path (see {@link mapCanonicalResult})
   * and therefore never reach this catch.
   */
  private async sendViaCanonical(
    workspaceId: string,
    request: ChannelSendRequest,
  ): Promise<ChannelSendResult | null> {
    if (!this.canonicalDispatch) {
      return null;
    }
    const input = await this.buildCanonicalInput(workspaceId, request);
    if (!input) {
      return null;
    }
    try {
      const result = await this.canonicalDispatch.sendMessage(input);
      return this.mapCanonicalResult(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown_error';
      this.logger.error(
        `Canonical delegate send erro workspace=${workspaceId} channel=${request.channel}: ${message}`,
      );
      return { success: false, blocked: false, error: message };
    }
  }

  /** Map the transport request's media/threading fields onto DispatchOptions. */
  private toDispatchOptions(request: ChannelSendRequest): DispatchOptions {
    const opts: DispatchOptions = {};
    if (request.mediaUrl !== undefined) {
      opts.mediaUrl = request.mediaUrl;
    }
    if (request.mediaType !== undefined) {
      opts.mediaType = request.mediaType;
    }
    if (request.caption !== undefined) {
      opts.caption = request.caption;
    }
    if (request.quotedMessageId !== undefined) {
      opts.quotedMessageId = request.quotedMessageId;
    }
    if (request.externalId !== undefined) {
      opts.externalId = request.externalId;
    }
    if (request.complianceMode !== undefined) {
      opts.complianceMode = request.complianceMode;
    }
    if (request.forceDirect !== undefined) {
      opts.forceDirect = request.forceDirect;
    }
    return opts;
  }

  /**
   * Build the canonical {@link ChannelSendInput} via the shared helper builders.
   * WhatsApp needs no connection; Instagram/Messenger resolve the per-workspace
   * Meta connection. Returns `null` if a required connection cannot be resolved
   * so the caller falls back to the existing provider path (which surfaces its
   * own honest blocked result).
   */
  private async buildCanonicalInput(
    workspaceId: string,
    request: ChannelSendRequest,
  ): Promise<ChannelSendInput | null> {
    const opts = this.toDispatchOptions(request);
    try {
      switch (request.channel) {
        case 'whatsapp':
          return buildWhatsApp(workspaceId, request.recipientId, request.content, opts);
        case 'instagram': {
          const conn = await this.resolveMetaConnection(workspaceId, 'instagram');
          if (!conn) {
            return null;
          }
          return buildInstagram(workspaceId, request.recipientId, request.content, opts, conn);
        }
        case 'messenger': {
          const conn = await this.resolveMetaConnection(workspaceId, 'facebook');
          if (!conn) {
            return null;
          }
          return buildMessenger(workspaceId, request.recipientId, request.content, opts, conn);
        }
        default:
          return null;
      }
    } catch {
      // A builder threw (e.g. missing token): fall back to the current provider
      // path, which returns its own honest blocked result unchanged.
      return null;
    }
  }

  /** Resolve a Meta connection projection for the canonical Meta builders. */
  private async resolveMetaConnection(
    workspaceId: string,
    channel: 'instagram' | 'facebook',
  ): Promise<ResolvedMetaConnectionLike | null> {
    if (!this.metaConnection) {
      return null;
    }
    return this.metaConnection.resolveConnection(workspaceId, channel);
  }

  /**
   * Map a canonical CONTRACT-B {@link CanonicalChannelSendResult} (where
   * `blocked` is OPTIONAL) onto the transport CONTRACT-A
   * {@link ChannelSendResult} (where `blocked` is REQUIRED). On success
   * `blocked` is set to `false`; `messageId`/`error`/`blockedReason` are carried
   * through when present.
   */
  private mapCanonicalResult(result: CanonicalChannelSendResult): ChannelSendResult {
    const mapped: ChannelSendResult = {
      success: result.success,
      blocked: result.blocked ?? false,
    };
    if (result.messageId !== undefined) {
      mapped.messageId = result.messageId;
    }
    if (result.error !== undefined) {
      mapped.error = result.error;
    }
    if (result.blockedReason !== undefined) {
      mapped.blockedReason = result.blockedReason;
    }
    return mapped;
  }

  getRegisteredChannels(): ChannelName[] {
    return Array.from(this.providers.keys());
  }

  private guardAction(request: ChannelSendRequest): string {
    if (request.mediaType === 'audio') {
      return 'send_audio_message';
    }
    if (request.mediaType === 'document') {
      return 'send_document_message';
    }
    return 'send_message';
  }

  private guardContext(request: ChannelSendRequest): MindActionContext {
    return {
      ...request.guardContext,
      channel: request.channel,
      supportsAudio: request.channel !== 'email' && request.channel !== 'tiktok',
      supportsDocument: request.channel === 'whatsapp' || request.channel === 'email',
    };
  }

  private async buildGuardContext(
    workspaceId: string,
    request: ChannelSendRequest,
  ): Promise<MindActionContext> {
    const baseContext = this.guardContext(request);
    return (
      (await this.guardContextBuilder?.buildForSend(workspaceId, request, baseContext)) ??
      baseContext
    );
  }
}
