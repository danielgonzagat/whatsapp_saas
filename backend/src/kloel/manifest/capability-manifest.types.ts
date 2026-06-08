import type {
  CapabilityCategory,
  CapabilityMaturity,
} from '../capability-registry-v2/capability-registry-v2.types';

/**
 * FACTORY CAPABILITY MANIFEST — model-facing capability descriptors.
 *
 * The manifest is the silent contract the codebase hands to the model on every
 * turn: what it MUST do (mandatory journey obligations) and what it MAY call
 * (optional capabilities), derived deterministically from the existing
 * {@link CapabilityRegistryV2Service} surface. It is NEVER surfaced to the end
 * user and NEVER becomes a frontend button — every entry carries
 * `hiddenFromUser: true`, and the sanitizer must strip `internalName` from any
 * user-visible payload.
 *
 * These types are intentionally disjoint from the registry types: the registry
 * is the source of truth for execution; the manifest is the model-routing view
 * over it. The builder maps registry → manifest; nothing flows back.
 */

/**
 * Safety classification used by the router to decide whether a capability may be
 * offered silently or must be gated behind explicit confirmation. Derived from
 * the registry `category` + `requiresConfirmation` flags — never hand-authored.
 */
export type CapabilitySafetyLevel =
  | 'read_only' // QUERY / SELF_AWARENESS / META — no side effects
  | 'safe_mutation' // creates/edits non-sensitive state
  | 'sensitive_mutation' // money/documents/account — requires confirmation
  | 'communication'; // outbound messages to third parties

/**
 * Safety profile attached to every manifest entry. `requiresConfirmation`
 * mirrors the registry contract so the router never silently offers a money/doc
 * mutation as a free action.
 */
export interface CapabilitySafetyProfile {
  level: CapabilitySafetyLevel;
  requiresConfirmation: boolean;
  requiredPermissions: string[];
}

/**
 * A single typed input the model must populate to invoke the capability. Mirrors
 * the registry `CapabilityInputField` but narrowed to what the model needs to
 * reason about (key, type, whether it is mandatory).
 */
export interface CapabilityManifestInput {
  key: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'file';
  required: boolean;
  enum?: string[];
}

/**
 * One capability as the model sees it. `internalName` is the registry id used by
 * the dispatcher; it is HIDDEN from the user and must never be echoed back in a
 * sanitized response. `triggers` are lowercase routing keywords derived from the
 * registry title/id/input labels.
 */
export interface CapabilityManifestEntry {
  /** Stable manifest id (equal to the registry capability id). */
  id: string;
  /** Internal dispatcher name — HIDDEN FROM USER. */
  internalName: string;
  /** One-line model-facing description (registry description, cleaned). */
  description: string;
  /** Lowercase keywords the router matches the user message against. */
  triggers: string[];
  /** Typed inputs the model must supply. */
  inputs: CapabilityManifestInput[];
  /** Domain events the capability emits on success (model-facing "outputs"). */
  outputs: string[];
  /** Safety classification + permission gate. */
  safetyProfile: CapabilitySafetyProfile;
  /** Always true — manifest entries are never user-facing buttons. */
  hiddenFromUser: true;
  /** Registry category (for grouping/debug only). */
  category: CapabilityCategory;
  /** Registry maturity (router can suppress non-shippable capabilities). */
  maturity: CapabilityMaturity;
  /** Surfaces the capability is available on (e.g. `dashboard-chat`). */
  surface: string[];
}

/**
 * A mandatory journey obligation — something the model MUST honor this turn
 * regardless of the user message (e.g. confirm name, never fabricate a receipt).
 * Distinct from optional capabilities: obligations are always injected.
 */
export interface CapabilityManifestObligation {
  id: string;
  /** Imperative instruction in the assistant's working language (PT-BR). */
  instruction: string;
  /** Why this obligation exists, for audit/debug — never shown to the user. */
  rationale: string;
}

/**
 * The full factory manifest: the complete model-facing capability surface plus
 * the always-on obligations. The router selects a subset of `capabilities`; the
 * `obligations` are always carried.
 */
export interface CapabilityManifest {
  /** Manifest schema version — bump on breaking shape changes. */
  version: number;
  /** All optional capabilities the model may invoke. */
  capabilities: CapabilityManifestEntry[];
  /** Mandatory obligations always injected into the model context. */
  obligations: CapabilityManifestObligation[];
}

/**
 * Context passed to the router so it can scope the manifest to the live turn:
 * the surface (e.g. `dashboard-chat`), the actor's permissions, and an optional
 * cap on how many capabilities to inject (token budget).
 */
export interface CapabilityRouterContext {
  surface: string;
  permissions: string[];
  /** Hard ceiling on selected capabilities (default applied by the router). */
  maxCapabilities?: number;
}

/**
 * The router's per-turn decision: the relevant capability subset plus the
 * obligations, ready for compact injection. Never contains user-facing fields.
 */
export interface CapabilityRouterSelection {
  capabilities: CapabilityManifestEntry[];
  obligations: CapabilityManifestObligation[];
}
