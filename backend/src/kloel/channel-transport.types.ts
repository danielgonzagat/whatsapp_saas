import type { MindActionContext } from './mind/policy/mind-code-native.types';
import type { CanonicalChannelName } from '../common/channel-dispatch/channel-dispatch.port';

/**
 * Message-dispatchable channel names for the guarded {@link
 * ChannelTransportRegistry} send path.
 *
 * Canonicalization (OmniCore W3): this is no longer a hand-written string
 * union — it is DERIVED from the single source of truth
 * {@link CanonicalChannelName} (`channel-dispatch.port#ChannelKind`). It is the
 * outbound-messaging subset of that vocabulary: the five channels the transport
 * providers can actually send through today. `facebook`, `internal-partnership`
 * and `internal-admin` exist in {@link ChannelKind} but are NOT transport-send
 * channels here (facebook is a Messenger PSID surface; the internal kinds are
 * copilot/partner surfaces routed by {@link ChannelDispatchRegistry}).
 *
 * The name `ChannelName` is preserved as the back-compat alias so the existing
 * importers (inbox, kloel tool executors, webhooks, cia, providers) keep
 * compiling unchanged — there is now ONE `ChannelKind` enum and this is a typed
 * view onto it.
 */
export type ChannelName = Extract<
  CanonicalChannelName,
  'whatsapp' | 'instagram' | 'messenger' | 'tiktok' | 'email'
>;

export interface ChannelCapability {
  channel: ChannelName;
  sendAvailable: boolean;
  sendBlockedReason: string | null;
  requiredSetup: string[];
}

export interface ChannelSendRequest {
  workspaceId: string;
  channel: ChannelName;
  recipientId: string;
  content: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
  caption?: string;
  externalId?: string;
  complianceMode?: 'reactive' | 'proactive';
  forceDirect?: boolean;
  quotedMessageId?: string;
  guardContext?: MindActionContext;
}

export interface ChannelSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  blocked: boolean;
  blockedReason?: string;
}

export interface ChannelTransportProvider {
  readonly channel: ChannelName;

  capability(workspaceId: string): Promise<ChannelCapability>;

  send(workspaceId: string, request: ChannelSendRequest): Promise<ChannelSendResult>;

  isConfigured(): boolean;
}
