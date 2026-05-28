import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  ChannelKind,
  type ChannelDispatchPort,
  type ChannelSendInput,
  type ChannelSendResult,
} from './channel-dispatch.port';

/**
 * Injection token for the array of `ChannelDispatchPort` adapters. Use this
 * symbol with a `useFactory` provider so NestJS can inject the discovered
 * adapter list into `ChannelDispatchRegistry`.
 *
 * @cluster Channel/Dispatch
 */
export const CHANNEL_DISPATCH_ADAPTERS = 'CHANNEL_DISPATCH_ADAPTERS';

/**
 * ChannelDispatchRegistry resolves the correct ChannelDispatchPort
 * adapter for a given ChannelKind and delegates send().
 *
 * Adapters are registered via NestJS dependency injection — each
 * adapter is a provider that implements ChannelDispatchPort and
 * exposes its `channelKind` discriminant. The MarketingChannelsModule
 * collects the 6 adapters (WhatsApp/Instagram/Messenger/Facebook/Email/
 * InternalPartnership) into the CHANNEL_DISPATCH_ADAPTERS token via a
 * useFactory provider; that array is then injected here.
 */

@Injectable()
export class ChannelDispatchRegistry {
  private readonly logger = new Logger(ChannelDispatchRegistry.name);
  private readonly adapters = new Map<ChannelKind, ChannelDispatchPort>();

  constructor(
    @Optional()
    @Inject(CHANNEL_DISPATCH_ADAPTERS)
    adapters?: ChannelDispatchPort[],
  ) {
    if (adapters) {
      for (const adapter of adapters) {
        if (this.adapters.has(adapter.channelKind)) {
          this.logger.warn(`Duplicate adapter for channel ${adapter.channelKind}; overwriting.`);
        }
        this.adapters.set(adapter.channelKind, adapter);
      }
    }
  }

  /** Register an adapter explicitly (for non-NestJS or dynamic use). */
  register(adapter: ChannelDispatchPort): void {
    this.adapters.set(adapter.channelKind, adapter);
  }

  /** Get the adapter for a channel kind. */
  get(kind: ChannelKind): ChannelDispatchPort | undefined {
    return this.adapters.get(kind);
  }

  /** Dispatch a message to the correct channel adapter. */
  async send(input: ChannelSendInput): Promise<ChannelSendResult> {
    const adapter = this.adapters.get(input.channelKind);
    if (!adapter) {
      return {
        success: false,
        error: `No adapter registered for channel ${input.channelKind}`,
        blocked: true,
        blockedReason: `channel_${input.channelKind}_not_configured`,
      };
    }
    return adapter.send(input);
  }

  /** Check if a channel is configured. */
  isConfigured(kind: ChannelKind): boolean {
    const adapter = this.adapters.get(kind);
    return adapter?.isConfigured?.() ?? false;
  }

  /** List all registered channel kinds. */
  listKinds(): ChannelKind[] {
    return Array.from(this.adapters.keys());
  }
}
