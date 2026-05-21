import type { AbiValence, AbiTruthMode } from '../abi/abi-schema';

/**
 * Per-channel terminal event policy.
 *
 * Each channel declares which events are "terminal" for that channel,
 * plus the default valence and truthMode applied when an upstream
 * emitter omits them.
 *
 * PCI.5 §3 — terminal events MUST carry valence.
 * PCI.5 §1 — every event MUST carry a truthMode.
 *
 * This module replaces the single hardcoded TERMINAL_EVENT_NAMES +
 * DEFAULT_TERMINAL_VALENCE tables in mind.types.ts with per-channel
 * policies that are inspectable, overridable, and testable in isolation.
 */
export interface ChannelTerminalPolicy {
  readonly channelName: string;
  readonly terminalEventNames: readonly string[];
  readonly defaultValenceByName: Readonly<Record<string, AbiValence>>;
  readonly defaultTruthModeByName: Readonly<Record<string, AbiTruthMode>>;
}

/**
 * Minimal shape accepted by ChannelPolicyRegistry.applyTo().
 *
 * Consumers pass any object with `eventName` (required) and optional
 * `valence` / `truthMode`. The registry only fills fields that are
 * explicitly `undefined` — it never overwrites an explicit value.
 */
export interface ApplicableEvent {
  readonly eventName: string;
  readonly valence?: AbiValence | undefined;
  readonly truthMode?: AbiTruthMode | undefined;
}

/**
 * Result shape returned by applyTo() — same fields as ApplicableEvent.
 *
 * valence and/or truthMode may be filled from the matching policy when
 * the upstream value was absent.
 */
export interface AppliedEvent extends ApplicableEvent {}

/**
 * Snapshot of every registered policy, keyed by channelName.
 */
export type ChannelPolicySnapshot = Readonly<Record<string, ChannelTerminalPolicy>>;

/**
 * Token used for NestJS DI (optional override).
 */
export const CHANNEL_POLICY_SNAPSHOT = Symbol('CHANNEL_POLICY_SNAPSHOT');
