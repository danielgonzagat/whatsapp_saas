// PULSE — Live Codebase Nervous System
// Wave 8 — Audit Chain types

/**
 * A single block in the signed audit chain.
 *
 * Each block captures a snapshot of the codebase state (treeHash),
 * the decision that was made (decisionHash), and a cryptographic
 * signature linking them together with the previous block (prevHash).
 */
export interface AuditBlock {
  /** Monotonically increasing block index (0 = genesis). */
  index: number;
  /** SHA-256 hash of the previous block's serialized content. */
  prevHash: string;
  /** SHA-256 hash of the codebase state at this point (git tree hash or file snapshot hash). */
  treeHash: string;
  /** SHA-256 hash of the decision metadata (what was decided / executed). */
  decisionHash: string;
  /** HMAC-SHA256 signature over the block content. */
  signature: string;
  /** ISO-8601 timestamp when this block was created. */
  timestamp: string;
  /** Human-readable metadata about what this block represents. */
  metadata: {
    /** Daemon iteration number at the time this block was created. */
    iteration: number;
    /** Convergence unit id that was targeted, if any. */
    unitId: string | null;
    /** Agent executor name (e.g. "codex", "kilo"). */
    agent: string;
    /** PULSE score before this cycle. */
    scoreBefore: number;
    /** PULSE score after this cycle. */
    scoreAfter: number;
    /** Files that were changed during the cycle this block records. */
    filesChanged: string[];
  };
}

/**
 * Full audit chain — an append-only, verifiable execution trail.
 *
 * Stored as an append-only JSONL file at `.pulse/audit/PULSE_AUDIT_CHAIN.jsonl`.
 * Each line is a serialized {@link AuditBlock}.
 */
export interface AuditChain {
  /** Unique identifier for this chain instance. */
  chainId: string;
  /** SHA-256 hash of the genesis block (the anchor of trust). */
  genesisHash: string;
  /** All blocks in the chain, from genesis to tip. */
  blocks: AuditBlock[];
  /** Whether the last full verification passed. */
  verified: boolean;
  /** ISO-8601 timestamp of the last verification, or null if never verified. */
  lastVerified: string | null;
  /** Blocks that failed verification, indexed by block number. */
  verificationFailures: Array<{
    /** Block index that failed. */
    blockIndex: number;
    /** Human-readable reason for the verification failure. */
    reason: string;
  }>;
}
