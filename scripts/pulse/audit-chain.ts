/**
 * Audit Chain — append-only execution trail with optional HMAC-SHA256 signing.
 *
 * Wave 8, Module C.
 *
 * The audit chain provides an execution history of every autonomous action
 * PULSE takes. Each block captures a snapshot of the codebase state (treeHash)
 * and the decision that was made (decisionHash). Blocks are cryptographically
 * signed only when `PULSE_AUDIT_SIGNING_KEY` is configured.
 *
 * Blocks are stored as an append-only JSONL file at
 * `.pulse/audit/PULSE_AUDIT_CHAIN.jsonl`. Verification walks forward from the
 * genesis block checking prevHash continuity and signature validity when
 * signing is configured.
 */
import * as path from 'node:path';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { appendTextFile, ensureDir, pathExists, readTextFile, writeTextFile } from './safe-fs';
import { resolveRoot } from './lib/safe-path';
import type {
  AuditBlock,
  AuditChain,
  AuditSignatureMode,
  AuditSigningKeyStatus,
} from './types.audit-chain';

// ── Constants ─────────────────────────────────────────────────────────────────

const AUDIT_CHAIN_FILENAME = 'PULSE_AUDIT_CHAIN.jsonl';
const AUDIT_CHAIN_ID_FILENAME = 'PULSE_AUDIT_CHAIN_ID.txt';
const HASH_ALGORITHM = 'sha256';
const ZERO_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

// ── Path helpers ──────────────────────────────────────────────────────────────

function auditChainPath(rootDir: string): string {
  return path.join(rootDir, '.pulse', 'audit', AUDIT_CHAIN_FILENAME);
}

function auditChainIdPath(rootDir: string): string {
  return path.join(rootDir, '.pulse', 'audit', AUDIT_CHAIN_ID_FILENAME);
}

function getOrCreateChainId(rootDir: string): string {
  const idPath = auditChainIdPath(rootDir);
  ensureDir(path.dirname(idPath), { recursive: true });
  if (pathExists(idPath)) {
    return readTextFile(idPath).trim();
  }
  const id = randomUUID();
  writeTextFile(idPath, id);
  return id;
}

// ── HMAC key resolution ───────────────────────────────────────────────────────

interface AuditSigningConfig {
  mode: AuditSignatureMode;
  keyStatus: AuditSigningKeyStatus;
  key: string | null;
}

function getSigningConfig(): AuditSigningConfig {
  const key = process.env.PULSE_AUDIT_SIGNING_KEY?.trim();
  if (!key) {
    return {
      mode: 'unsigned',
      keyStatus: 'not_configured',
      key: null,
    };
  }

  return {
    mode: 'hmac_sha256',
    keyStatus: 'configured',
    key,
  };
}

// ── Git tree hash ─────────────────────────────────────────────────────────────

function getGitTreeHash(rootDir: string): string {
  try {
    const result = spawnSync('git', ['rev-parse', 'HEAD:'], {
      cwd: rootDir,
      encoding: 'utf8',
      timeout: 10_000,
    });
    if (result.status === 0 && result.stdout.trim()) {
      return result.stdout.trim();
    }
  } catch {
    // Git not available — fall through to file hash
  }
  return '';
}

// ── File snapshot hash ────────────────────────────────────────────────────────

function computeFilesHash(rootDir: string, files: string[]): string {
  if (files.length === 0) return getGitTreeHash(rootDir) || '';

  const hash = createHash(HASH_ALGORITHM);
  const sorted = [...files].sort();

  for (const file of sorted) {
    hash.update(file);
    try {
      const content = readTextFile(path.join(rootDir, file));
      hash.update(content);
    } catch {
      hash.update('unreadable');
    }
  }

  return hash.digest('hex');
}

// ── Block serialization ───────────────────────────────────────────────────────

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(',')}}`;
}

function computeDecisionHash(metadata: AuditBlock['metadata']): string {
  return createHash(HASH_ALGORITHM).update(stableSerialize(metadata)).digest('hex');
}

function computeLegacyDecisionHash(metadata: AuditBlock['metadata']): string {
  return createHash(HASH_ALGORITHM).update(JSON.stringify(metadata)).digest('hex');
}

/**
 * Compute a deterministic SHA-256 hash of an AuditBlock's core fields.
 *
 * The hash covers: index, prevHash, treeHash, decisionHash, timestamp,
 * and all metadata fields in structured order. The signature field is
 * excluded to avoid circularity.
 *
 * @param block  The audit block to hash.
 * @returns Lowercase hex-encoded SHA-256 digest.
 */
export function computeBlockHash(block: AuditBlock): string {
  const hash = createHash(HASH_ALGORITHM);
  hash.update(String(block.index));
  hash.update(block.prevHash);
  hash.update(block.treeHash);
  hash.update(block.decisionHash);
  hash.update(block.timestamp);
  hash.update(String(block.metadata.iteration));
  hash.update(block.metadata.unitId ?? 'null');
  hash.update(block.metadata.agent);
  hash.update(String(block.metadata.scoreBefore));
  hash.update(String(block.metadata.scoreAfter));
  for (const file of [...block.metadata.filesChanged].sort()) {
    hash.update(file);
  }
  return hash.digest('hex');
}

/**
 * Sign a block with HMAC-SHA256 when a real key is configured.
 *
 * Without `PULSE_AUDIT_SIGNING_KEY`, the block is marked as unsigned and the
 * signature stays empty. This keeps the trail honest instead of pretending a
 * default secret produced a real signature.
 *
 * @param block  The block to sign or mark unsigned.
 * @returns The block with signature metadata populated.
 */
function signBlock(block: AuditBlock): AuditBlock {
  const signingConfig = getSigningConfig();
  block.signatureMode = signingConfig.mode;
  block.signingKeyStatus = signingConfig.keyStatus;

  if (!signingConfig.key) {
    block.signature = '';
    return block;
  }

  const blockHash = computeBlockHash(block);
  const hmac = createHmac(HASH_ALGORITHM, signingConfig.key);
  hmac.update(blockHash);
  block.signature = hmac.digest('hex');
  return block;
}

/**
 * Verify a block's signature against its computed hash.
 *
 * @param block  The block to verify.
 * @returns Verification result with an explicit failure reason.
 */
function verifySignature(block: AuditBlock): { valid: boolean; reason: string | null } {
  const mode = block.signatureMode ?? 'hmac_sha256';
  const blockKeyStatus = block.signingKeyStatus ?? 'configured';

  if (mode === 'unsigned' || blockKeyStatus === 'not_configured') {
    return { valid: true, reason: null };
  }

  const signingConfig = getSigningConfig();
  if (!signingConfig.key) {
    return {
      valid: false,
      reason: 'signature verification unavailable: PULSE_AUDIT_SIGNING_KEY is not configured',
    };
  }

  const blockHash = computeBlockHash(block);
  const hmac = createHmac(HASH_ALGORITHM, signingConfig.key);
  hmac.update(blockHash);
  const expectedSignature = hmac.digest('hex');
  if (block.signature !== expectedSignature) {
    return {
      valid: false,
      reason: 'signature invalid',
    };
  }

  return { valid: true, reason: null };
}

// ── JSONL I/O ─────────────────────────────────────────────────────────────────

function readAllBlocks(rootDir: string): {
  blocks: AuditBlock[];
  readFailures: AuditChain['verificationFailures'];
} {
  const filePath = auditChainPath(rootDir);
  if (!pathExists(filePath)) return { blocks: [], readFailures: [] };

  const content = readTextFile(filePath);
  const lines = content
    .split('\n')
    .map((line, index) => ({ line, index }))
    .filter((entry) => entry.line.trim().length > 0);
  const blocks: AuditBlock[] = [];
  const readFailures: AuditChain['verificationFailures'] = [];

  for (const { line, index } of lines) {
    try {
      blocks.push(JSON.parse(line) as AuditBlock);
    } catch {
      readFailures.push({
        blockIndex: index,
        reason: `Block ${index} is not valid JSON; audit history is corrupted`,
      });
    }
  }

  return { blocks, readFailures };
}

function appendBlockToFile(rootDir: string, block: AuditBlock): void {
  const filePath = auditChainPath(rootDir);
  ensureDir(path.dirname(filePath), { recursive: true });
  const line = JSON.stringify(block) + '\n';
  appendTextFile(filePath, line);
}

// ── Chain management ──────────────────────────────────────────────────────────

/**
 * Build (or load) the full audit chain.
 *
 * If no chain exists, creates a genesis block and starts a new chain.
 * Otherwise loads the existing chain from `.pulse/audit/PULSE_AUDIT_CHAIN.jsonl`
 * and verifies its integrity.
 *
 * @param rootDir  Absolute or relative path to the repository root.
 * @returns The loaded or newly created audit chain.
 */
export function buildAuditChain(rootDir: string): AuditChain {
  const resolvedRoot = resolveRoot(rootDir);
  const chainId = getOrCreateChainId(resolvedRoot);
  const loaded = readAllBlocks(resolvedRoot);
  let blocks = loaded.blocks;

  if (blocks.length === 0) {
    const genesisBlock: AuditBlock = {
      index: 0,
      prevHash: ZERO_HASH,
      treeHash:
        getGitTreeHash(resolvedRoot) || createHash(HASH_ALGORITHM).update('genesis').digest('hex'),
      decisionHash: createHash(HASH_ALGORITHM).update('genesis').digest('hex'),
      signature: '',
      signatureMode: 'unsigned',
      signingKeyStatus: 'not_configured',
      timestamp: new Date().toISOString(),
      metadata: {
        iteration: 0,
        unitId: null,
        agent: 'genesis',
        scoreBefore: 0,
        scoreAfter: 0,
        filesChanged: [],
      },
    };

    signBlock(genesisBlock);
    appendBlockToFile(resolvedRoot, genesisBlock);
    blocks = [genesisBlock];
  }

  const genesisHash = blocks[0] ? computeBlockHash(blocks[0]) : '';

  const chain: AuditChain = {
    chainId,
    genesisHash,
    blocks,
    verified: false,
    lastVerified: null,
    verificationFailures: [],
  };

  const verifiedChain = verifyChain(chain);
  if (loaded.readFailures.length === 0) {
    return verifiedChain;
  }

  return {
    ...verifiedChain,
    verified: false,
    verificationFailures: [...loaded.readFailures, ...verifiedChain.verificationFailures],
  };
}

/**
 * Append a new block to the audit chain.
 *
 * Computes prevHash from the tip of the existing chain, computes treeHash
 * from git state or file snapshot, computes decisionHash from metadata,
 * signs the block, and appends it as a JSONL line.
 *
 * @param chain     The current audit chain.
 * @param metadata  Metadata describing what happened in this block.
 * @param rootDir   Absolute or relative path to the repository root.
 * @returns The updated audit chain including the new block.
 */
export function appendBlock(
  chain: AuditChain,
  metadata: AuditBlock['metadata'],
  rootDir: string,
): AuditChain {
  const resolvedRoot = resolveRoot(rootDir);

  const prevBlock = chain.blocks[chain.blocks.length - 1] ?? null;
  const prevHash = prevBlock ? computeBlockHash(prevBlock) : chain.genesisHash;

  const treeHash = computeFilesHash(resolvedRoot, metadata.filesChanged);

  const decisionHash = computeDecisionHash(metadata);

  const block: AuditBlock = {
    index: chain.blocks.length,
    prevHash,
    treeHash,
    decisionHash,
    signature: '',
    signatureMode: 'unsigned',
    signingKeyStatus: 'not_configured',
    timestamp: new Date().toISOString(),
    metadata: { ...metadata },
  };

  signBlock(block);
  appendBlockToFile(resolvedRoot, block);

  return {
    ...chain,
    blocks: [...chain.blocks, block],
  };
}
