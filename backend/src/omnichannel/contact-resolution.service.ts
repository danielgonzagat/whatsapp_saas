import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  ChannelIdentifierService,
  ResolvedContact,
  normalizeChannelIdentifierChannel,
} from '../contacts/channel-identifier.service';
import {
  ContactIdentityResolverService,
  IdentityResolveParams,
} from '../contacts/contact-identity-resolver.service';
import { type NormalizedMessage } from '../inbox/omnichannel.helpers';
import { isOmniCanonicalIdentityEnabled } from './omni-canonical-identity.flag';

export { ResolvedContact };

@Injectable()
export class OmnichannelContactResolutionService {
  private readonly logger = new Logger(OmnichannelContactResolutionService.name);

  constructor(
    private readonly channelIdentifier: ChannelIdentifierService,
    @Optional()
    private readonly identityResolver?: ContactIdentityResolverService,
  ) {
    this.logger.debug?.(`OmnichannelContactResolutionService initialized`);
  }

  resolveFromMessage(
    msg: NormalizedMessage,
    options?: { name?: string },
  ): Promise<ResolvedContact> {
    const channel = msg.channel;
    const value = this.extractChannelValue(channel, msg.from, msg.externalId);

    const resolvedName = options?.name || msg.fromName;

    if (isOmniCanonicalIdentityEnabled() && this.identityResolver) {
      return this.resolveViaCanonicalIdentity(channel, value, msg, resolvedName);
    }

    return this.channelIdentifier.resolve(channel, value, msg.workspaceId, {
      ...(resolvedName !== undefined ? { name: resolvedName } : {}),
      isPrimary: true,
      metadata: {
        rawFrom: msg.from,
        rawExternalId: msg.externalId,
        channel: msg.channel,
      },
    });
  }

  /**
   * Flag-ON path (KLOEL_OMNI_CANONICAL_IDENTITY): delegate the find-or-create to
   * the canonical {@link ContactIdentityResolverService.resolve} so the SAME
   * human is reconciled across channels (phone / email / social-handle verified
   * match) instead of minting a duplicate contact per channel identifier. The
   * canonical result (ids only) is materialised back into the
   * {@link ResolvedContact} contract every caller consumes. Guarded by the flag
   * and the `@Optional` resolver slot — never reached when OFF or unbound.
   */
  private async resolveViaCanonicalIdentity(
    channel: string,
    value: string,
    msg: NormalizedMessage,
    resolvedName: string | undefined,
  ): Promise<ResolvedContact> {
    const resolver = this.identityResolver;
    if (!resolver) {
      return this.channelIdentifier.resolve(channel, value, msg.workspaceId, {
        ...(resolvedName !== undefined ? { name: resolvedName } : {}),
        isPrimary: true,
        metadata: {
          rawFrom: msg.from,
          rawExternalId: msg.externalId,
          channel: msg.channel,
        },
      });
    }

    const normalizedChannel = normalizeChannelIdentifierChannel(channel);
    const params: IdentityResolveParams = {
      workspaceId: msg.workspaceId,
      channel: normalizedChannel,
      externalId: value,
    };
    if (normalizedChannel === 'WHATSAPP') {
      params.phone = value;
    } else if (normalizedChannel === 'EMAIL') {
      params.email = value;
    } else if (normalizedChannel === 'INSTAGRAM') {
      params.socialHandle = value;
    }

    const identity = await resolver.resolve(params);

    const materialized = await this.channelIdentifier.findContactByChannel(
      normalizedChannel,
      value,
      msg.workspaceId,
    );
    if (materialized) {
      return { ...materialized, wasCreated: identity.wasCreated };
    }

    // Defensive fallback: the canonical resolver always persists a channel
    // identifier for (workspace, channel, value), so a missing materialisation
    // is unexpected — fall back to the legacy resolve so the caller still gets a
    // valid ResolvedContact rather than throwing.
    return this.channelIdentifier.resolve(channel, value, msg.workspaceId, {
      ...(resolvedName !== undefined ? { name: resolvedName } : {}),
      isPrimary: true,
      metadata: {
        rawFrom: msg.from,
        rawExternalId: msg.externalId,
        channel: msg.channel,
      },
    });
  }

  async findExisting(
    channel: string,
    from: string,
    externalId: string,
    workspaceId: string,
  ): Promise<ResolvedContact | null> {
    const value = this.extractChannelValue(channel, from, externalId);
    return this.channelIdentifier.findContactByChannel(channel, value, workspaceId);
  }

  linkChannelToContact(
    channel: string,
    from: string,
    externalId: string,
    contactId: string,
    workspaceId: string,
  ): ReturnType<ChannelIdentifierService['linkIdentifier']> {
    const value = this.extractChannelValue(channel, from, externalId);
    return this.channelIdentifier.linkIdentifier(channel, value, contactId, workspaceId, {
      isPrimary: false,
    });
  }

  private extractChannelValue(channel: string, from: string, externalId: string): string {
    const normalizedChannel = normalizeChannelIdentifierChannel(channel);
    if (normalizedChannel === 'WHATSAPP' || normalizedChannel === 'EMAIL') {
      return from;
    }
    if (normalizedChannel === 'INSTAGRAM' || normalizedChannel === 'MESSENGER') {
      return externalId || from;
    }
    return externalId || from || 'unknown';
  }
}
