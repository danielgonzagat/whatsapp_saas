/** Branded string type for prompt identifiers (e.g. `assistant.analyze_sentiment.system`). */
export type PromptId = string;

/** Semver-style version string (e.g. `1.2`). */
export type PromptVersion = string;

/** A single entry in the version changelog. */
export interface PromptChangelogEntry {
  /** Version this changelog entry corresponds to. */
  version: PromptVersion;
  /** ISO-8601 date of the change. */
  date: string;
  /** Author identifier (name or handle). */
  author: string;
  /** Human-readable description of the change. */
  note: string;
}

/** Shape of every prompt stored in the registry. */
export interface RegisteredPrompt {
  /** Stable unique identifier for the prompt. */
  id: PromptId;
  /** Current semver version. */
  version: PromptVersion;
  /** SHA-256 hex digest of the normalized template string. */
  sha256: string;
  /** The prompt template text. May contain `{{param}}` placeholders. */
  template: string;
  /** Declared parameter names used by the template. */
  params: string[];
  /** Target model key (e.g. `brain`, `fast`, `vision`). */
  model: string | null;
  /** Expected response format constraint when applicable. */
  responseFormat: 'json_object' | 'text' | null;
  /** Sampling temperature (0–2). */
  temperature: number | null;
  /** Maximum output tokens. */
  maxTokens: number | null;
  /** Ordered version history. */
  changelog: PromptChangelogEntry[];
}
