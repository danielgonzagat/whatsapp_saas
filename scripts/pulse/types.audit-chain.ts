// PULSE — Live Codebase Nervous System
// Wave 8 — Audit Chain types

/**
 * Signature mode used by an audit block.
 */
export type AuditSignatureMode = 'hmac_sha256' | 'unsigned';

/**
 * Runtime configuration status for audit signing.
 */
export type AuditSigningKeyStatus = 'configured' | 'not_configured';

/**
 * A single block in the audit chain.
 *
 * Each block captures a snapshot of the codebase state (treeHash),
 * the decision that was made (decisionHash), and either a cryptographic
 * signature or an explicit unsigned marker when signing is not configured.
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
  /** HMAC-SHA256 signature over the block content, empty when unsigned. */
  signature: string;
  /** Signature mode used for this block. */
  signatureMode: AuditSignatureMode;
  /** Whether a real signing key was configured when this block was created. */
  signingKeyStatus: AuditSigningKeyStatus;
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
 * Full audit chain — an append-only execution trail.
 *
 * Stored as an append-only JSONL file at `.pulse/audit/PULSE_AUDIT_CHAIN.jsonl`.
 * Each line is a serialized {@link AuditBlock}.
 */
export interface AuditChain {
  /** Unique identifier for this chain instance. */
  chainId: string;
  /** SHA-256 hash of the genesis block. */
  genesisHash: string;
  /** All blocks in the chain, from genesis to tip. */
  blocks: AuditBlock[];
  /** Whether the last full continuity and signature verification passed. */
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
