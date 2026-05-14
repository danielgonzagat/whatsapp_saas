import { Injectable, Optional } from '@nestjs/common';
import type {
  ApplicableEvent,
  AppliedEvent,
  ChannelTerminalPolicy,
  ChannelPolicySnapshot,
} from './channel-policy.types';
import { CHANNEL_POLICY_SNAPSHOT } from './channel-policy.types';

/**
 * Built-in per-channel terminal policies.
 *
 * Each policy declares which events are terminal for that channel and
 * provides the default valence + truthMode when the upstream emitter
 * does not supply them.
 *
 * Channels defined: whatsapp, web, email, ads.
 * See PCI.1 §3 for canonical event names.
 */
const BUILT_IN_POLICIES: readonly ChannelTerminalPolicy[] = [
  {
    channelName: 'whatsapp',
    terminalEventNames: [
      'commerce.whatsapp.message_received',
      'commerce.whatsapp.handoff_to_human',
      'commerce.whatsapp.session_lifecycle',
    ],
    defaultValenceByName: {
      'commerce.whatsapp.message_received': 'neutral',
      'commerce.whatsapp.handoff_to_human': 'negative',
      'commerce.whatsapp.session_lifecycle': 'neutral',
    },
    defaultTruthModeByName: {
      'commerce.whatsapp.message_received': 'observed',
      'commerce.whatsapp.handoff_to_human': 'observed',
      'commerce.whatsapp.session_lifecycle': 'observed',
    },
  },
  {
    channelName: 'web',
    terminalEventNames: [
      'commerce.cart.abandoned',
      'commerce.cart.checkout_initiated',
      'commerce.crm.deal_won',
      'commerce.crm.deal_lost',
      'commerce.lead.converted',
    ],
    defaultValenceByName: {
      'commerce.cart.abandoned': 'negative',
      'commerce.cart.checkout_initiated': 'neutral',
      'commerce.crm.deal_won': 'positive',
      'commerce.crm.deal_lost': 'negative',
      'commerce.lead.converted': 'positive',
    },
    defaultTruthModeByName: {
      'commerce.cart.abandoned': 'inferred',
      'commerce.cart.checkout_initiated': 'observed',
      'commerce.crm.deal_won': 'observed',
      'commerce.crm.deal_lost': 'observed',
      'commerce.lead.converted': 'observed',
    },
  },
  {
    channelName: 'email',
    terminalEventNames: [
      'commerce.campaign.clicked',
      'commerce.campaign.performance_drop_detected',
      'commerce.campaign.conversion_associated',
    ],
    defaultValenceByName: {
      'commerce.campaign.clicked': 'positive',
      'commerce.campaign.performance_drop_detected': 'negative',
      'commerce.campaign.conversion_associated': 'positive',
    },
    defaultTruthModeByName: {
      'commerce.campaign.clicked': 'observed',
      'commerce.campaign.performance_drop_detected': 'inferred',
      'commerce.campaign.conversion_associated': 'inferred',
    },
  },
  {
    channelName: 'ads',
    terminalEventNames: [
      'commerce.campaign.performance_drop_detected',
      'commerce.campaign.creative_swapped',
      'commerce.campaign.audience_reached',
    ],
    defaultValenceByName: {
      'commerce.campaign.performance_drop_detected': 'negative',
      'commerce.campaign.creative_swapped': 'neutral',
      'commerce.campaign.audience_reached': 'positive',
    },
    defaultTruthModeByName: {
      'commerce.campaign.performance_drop_detected': 'inferred',
      'commerce.campaign.creative_swapped': 'observed',
      'commerce.campaign.audience_reached': 'observed',
    },
  },
];

function buildByChannel(
  policies: readonly ChannelTerminalPolicy[],
): Readonly<Record<string, ChannelTerminalPolicy>> {
  const map: Record<string, ChannelTerminalPolicy> = {};
  for (const p of policies) {
    map[p.channelName] = p;
  }
  return Object.freeze(map);
}

/**
 * ChannelPolicyRegistry — per-channel terminal valence + truthMode policy.
 *
 * Responsibilities:
 *   - Store built-in (and optionally injected) per-channel policies.
 *   - `get(channelName)` returns the policy for a given channel.
 *   - `applyTo(event)` fills default valence/truthMode from the
 *     matching channel policy when the event has no explicit value.
 *
 * Does NOT replace the ValenceTaggerService. Instead it provides the
 * per-channel policy surface that the tagger (or any consumer) can
 * consult for channel-specific defaults.
 */
@Injectable()
export class ChannelPolicyRegistry {
  private readonly byChannel: Readonly<Record<string, ChannelTerminalPolicy>>;

  public constructor(
    @Optional()
    @InjectOptionalPolicySnapshot()
    injected?: Readonly<Record<string, ChannelTerminalPolicy>> | null,
  ) {
    if (injected && Object.keys(injected).length > 0) {
      this.byChannel = Object.freeze({ ...injected });
    } else {
      this.byChannel = buildByChannel(BUILT_IN_POLICIES);
    }
  }

  /**
   * Return the policy for a channel, or undefined.
   */
  public get(channelName: string): ChannelTerminalPolicy | undefined {
    return this.byChannel[channelName];
  }

  /**
   * Return a frozen snapshot of every registered policy.
   */
  public snapshot(): ChannelPolicySnapshot {
    return this.byChannel;
  }

  /**
   * List every registered channel name.
   */
  public channelNames(): readonly string[] {
    return Object.keys(this.byChannel);
  }

  /**
   * Apply channel-policy defaults to an event.
   *
   * If `event.eventName` matches a terminal entry in any registered
   * policy, and `valence` and/or `truthMode` are absent on the event,
   * the policy defaults are filled in.
   *
   * Explicit values are NEVER overwritten.
   */
  public applyTo(event: ApplicableEvent): AppliedEvent {
    const policy = this.findPolicyForEvent(event.eventName);
    if (!policy) {
      return { eventName: event.eventName, valence: event.valence, truthMode: event.truthMode };
    }

    return {
      eventName: event.eventName,
      valence: event.valence ?? policy.defaultValenceByName[event.eventName],
      truthMode: event.truthMode ?? policy.defaultTruthModeByName[event.eventName],
    };
  }

  /**
   * Resolve a policy for the given channel name and apply defaults to
   * the event. This is the direct-access variant — `applyTo` is the
   * auto-detect variant.
   */
  public applyToChannel(channelName: string, event: ApplicableEvent): AppliedEvent {
    const policy = this.byChannel[channelName];
    if (!policy) {
      return { eventName: event.eventName, valence: event.valence, truthMode: event.truthMode };
    }
    if (!policy.terminalEventNames.includes(event.eventName)) {
      return { eventName: event.eventName, valence: event.valence, truthMode: event.truthMode };
    }

    return {
      eventName: event.eventName,
      valence: event.valence ?? policy.defaultValenceByName[event.eventName],
      truthMode: event.truthMode ?? policy.defaultTruthModeByName[event.eventName],
    };
  }

  private findPolicyForEvent(eventName: string): ChannelTerminalPolicy | undefined {
    for (const channel of Object.values(this.byChannel)) {
      if (channel.terminalEventNames.includes(eventName)) {
        return channel;
      }
    }
    return undefined;
  }
}

/**
 * Internal token helper so the Optional injection works with Symbol tokens.
 */
function InjectOptionalPolicySnapshot(): ParameterDecorator {
  return (target, _propertyKey, parameterIndex) => {
    const deps =
      (Reflect.getMetadata('self:paramtypes', target) as unknown[]) ??
      [];
    if (!Array.isArray(deps)) return;
    for (let i = deps.length; i <= parameterIndex; i++) {
      deps.push(undefined);
    }
    deps[parameterIndex] = CHANNEL_POLICY_SNAPSHOT;
    Reflect.defineMetadata('self:paramtypes', deps, target);

    const optionalDeps: boolean[] =
      (Reflect.getMetadata('optional:paramtypes', target) as boolean[]) ??
      [];
    if (!Array.isArray(optionalDeps)) return;
    for (let i = optionalDeps.length; i <= parameterIndex; i++) {
      optionalDeps.push(false);
    }
    optionalDeps[parameterIndex] = true;
    Reflect.defineMetadata('optional:paramtypes', optionalDeps, target);
  };
}
