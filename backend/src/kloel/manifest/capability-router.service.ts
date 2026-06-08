import { Injectable } from '@nestjs/common';
import { CapabilityManifestBuilderService } from './capability-manifest.builder';
import type {
  CapabilityManifest,
  CapabilityManifestEntry,
  CapabilityRouterContext,
  CapabilityRouterSelection,
} from './capability-manifest.types';

/** Default ceiling on injected capabilities — keeps the manifest compact. */
const DEFAULT_MAX_CAPABILITIES = 12;

/** Floor of high-signal read-only capabilities to keep even on a vague turn. */
const FALLBACK_FLOOR = 3;

const NON_WORD_SPLIT_RE = /[^\p{L}\p{N}]+/u;

interface ScoredEntry {
  entry: CapabilityManifestEntry;
  score: number;
}

/**
 * CAPABILITY ROUTER — selects the relevant manifest subset for a single turn.
 *
 * The router never dumps the whole manifest into the model context. Given the
 * user message and a {@link CapabilityRouterContext} (surface + permissions), it:
 *   1. scopes capabilities to the live surface + actor permissions,
 *   2. drops non-shippable (deprecated/blocked) capabilities,
 *   3. scores the rest by trigger overlap with the message,
 *   4. returns the top-N (token-budgeted) plus the always-on obligations.
 *
 * Disjoint from the registry and the builder: it consumes the builder's
 * read-only manifest and produces a selection. It owns no capability data.
 */
@Injectable()
export class CapabilityRouterService {
  constructor(private readonly manifestBuilder: CapabilityManifestBuilderService) {}

  /**
   * Select the relevant capability subset for `message` under `context`.
   *
   * Pure function of (current registry state, message, context): no I/O, no
   * side effects — safe to call on every model turn.
   */
  select(message: string, context: CapabilityRouterContext): CapabilityRouterSelection {
    const manifest = this.manifestBuilder.build();
    const scoped = this.scope(manifest, context);
    const messageTokens = this.tokenize(message);
    const limit = this.resolveLimit(context);

    const scored: ScoredEntry[] = scoped.map((entry) => ({
      entry,
      score: this.score(entry, messageTokens),
    }));

    const matched = scored
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id))
      .map((candidate) => candidate.entry);

    const primarySelected =
      matched.length > 0 ? matched.slice(0, limit) : this.fallback(scoped, limit);
    const selected = this.expandDependencies(primarySelected, scoped);

    return {
      capabilities: selected,
      obligations: manifest.obligations,
    };
  }

  private expandDependencies(
    primarySelected: CapabilityManifestEntry[],
    scoped: CapabilityManifestEntry[],
  ): CapabilityManifestEntry[] {
    const byId = new Map(scoped.map((entry) => [entry.id, entry]));
    const selected: CapabilityManifestEntry[] = [];
    const seen = new Set<string>();

    const append = (entry: CapabilityManifestEntry): boolean => {
      if (seen.has(entry.id)) {
        return false;
      }
      seen.add(entry.id);
      selected.push(entry);
      return true;
    };

    const appendDependencies = (entry: CapabilityManifestEntry): void => {
      for (const dependencyId of entry.dependsOn) {
        const dependency = byId.get(dependencyId);
        if (!dependency) {
          continue;
        }
        if (append(dependency)) {
          appendDependencies(dependency);
        }
      }
    };

    for (const entry of primarySelected) {
      if (append(entry)) {
        appendDependencies(entry);
      }
    }

    return selected;
  }

  /** Restrict to the live surface, actor permissions, and shippable maturity. */
  private scope(
    manifest: CapabilityManifest,
    context: CapabilityRouterContext,
  ): CapabilityManifestEntry[] {
    const wildcardPermissions = context.permissions.includes('*');
    return manifest.capabilities.filter((entry) => {
      if (!this.surfaceAllows(entry, context.surface)) {
        return false;
      }
      if (entry.maturity === 'deprecated' || entry.maturity === 'blocked') {
        return false;
      }
      return this.permissionsAllow(entry, context.permissions, wildcardPermissions);
    });
  }

  private surfaceAllows(entry: CapabilityManifestEntry, surface: string): boolean {
    return entry.surface.includes(surface) || entry.surface.includes('*');
  }

  private permissionsAllow(
    entry: CapabilityManifestEntry,
    permissions: string[],
    wildcard: boolean,
  ): boolean {
    if (wildcard) {
      return true;
    }
    const required = entry.safetyProfile.requiredPermissions;
    if (required.length === 0) {
      return true;
    }
    return required.some((permission) => permissions.includes(permission));
  }

  /** Trigger-overlap score: number of distinct message tokens hitting triggers. */
  private score(entry: CapabilityManifestEntry, messageTokens: Set<string>): number {
    if (messageTokens.size === 0) {
      return 0;
    }
    let hits = 0;
    for (const trigger of entry.triggers) {
      if (messageTokens.has(trigger)) {
        hits += 1;
      }
    }
    return hits;
  }

  /**
   * When nothing matched, keep a small floor of read-only capabilities so the
   * model is never blind. Deterministic: stable id order, read-only only.
   */
  private fallback(scoped: CapabilityManifestEntry[], limit: number): CapabilityManifestEntry[] {
    const floor = Math.min(FALLBACK_FLOOR, limit);
    return scoped
      .filter((entry) => entry.safetyProfile.level === 'read_only')
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, floor);
  }

  private resolveLimit(context: CapabilityRouterContext): number {
    const requested = context.maxCapabilities;
    if (typeof requested === 'number' && requested > 0) {
      return Math.floor(requested);
    }
    return DEFAULT_MAX_CAPABILITIES;
  }

  private tokenize(message: string): Set<string> {
    const tokens = new Set<string>();
    for (const part of message.toLowerCase().split(NON_WORD_SPLIT_RE)) {
      const token = part.trim();
      if (token.length >= 3) {
        tokens.add(token);
      }
    }
    return tokens;
  }
}
