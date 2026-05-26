import type { PromptId, PromptVersion, RegisteredPrompt } from './prompt-registry.types';

// ---------------------------------------------------------------------------
// Lightweight semver comparator — no external dependency needed
// ---------------------------------------------------------------------------

/** Split a `major.minor` version string into numeric parts. */
function parseVersion(v: PromptVersion): { major: number; minor: number } {
  const parts = v.split('.');
  if (parts.length !== 2) {
    throw new Error(`Invalid semver string: "${v}"`);
  }
  const major = parseInt(parts[0]!, 10);
  const minor = parseInt(parts[1]!, 10);
  if (isNaN(major) || isNaN(minor)) {
    throw new Error(`Invalid semver string: "${v}"`);
  }
  return { major, minor };
}

/** Return `true` when `candidate` is strictly greater than `current`. */
function isVersionBump(current: PromptVersion, candidate: PromptVersion): boolean {
  const cur = parseVersion(current);
  const cand = parseVersion(candidate);
  if (cand.major !== cur.major) {return cand.major > cur.major;}
  return cand.minor > cur.minor;
}

// ---------------------------------------------------------------------------
// PromptRegistry
// ---------------------------------------------------------------------------

/**
 * In-memory, synchronous registry for versioned LLM prompts.
 *
 * The skeleton holds zero prompts initially; future migrations populate it.
 */
export class PromptRegistry {
  private readonly store = new Map<PromptId, RegisteredPrompt>();

  /**
   * Register a prompt entry.
   *
   * - If the `id` is new the entry is inserted unconditionally.
   * - If the `id` already exists the new entry MUST carry a strictly higher
   *   `version` (semver bump). Non-bump re-registrations throw.
   */
  register(entry: RegisteredPrompt): void {
    const existing = this.store.get(entry.id);
    if (existing) {
      if (!isVersionBump(existing.version, entry.version)) {
        throw new Error(
          `Prompt "${entry.id}" already exists at version ${existing.version}. ` +
            `Cannot register version ${entry.version} — a semver bump is required.`,
        );
      }
    }
    this.store.set(entry.id, entry);
  }

  /** Retrieve a prompt by its id. Returns `undefined` when not found. */
  get(id: PromptId): RegisteredPrompt | undefined {
    return this.store.get(id);
  }

  /** Alias for {@link get}. Included for API clarity at call sites. */
  getById(id: PromptId): RegisteredPrompt | undefined {
    return this.get(id);
  }

  /** Return all registered prompts as a shallow copy array. */
  list(): RegisteredPrompt[] {
    return Array.from(this.store.values());
  }
}
