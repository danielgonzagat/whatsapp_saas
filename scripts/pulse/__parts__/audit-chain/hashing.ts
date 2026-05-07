import { createHash, createHmac } from 'node:crypto';
import type {
  AuditBlock,
  AuditSignatureMode,
  AuditSigningKeyStatus,
} from '../../types.audit-chain';

// ── Constants ─────────────────────────────────────────────────────────────────

const HASH_ALGORITHM = 'sha256';

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

// ── Block serialization ───────────────────────────────────────────────────────

export function stableSerialize(value: unknown): string {
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

export function computeDecisionHash(metadata: AuditBlock['metadata']): string {
  return createHash(HASH_ALGORITHM).update(stableSerialize(metadata)).digest('hex');
}

export function computeLegacyDecisionHash(metadata: AuditBlock['metadata']): string {
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
export function signBlock(block: AuditBlock): AuditBlock {
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
export function verifySignature(block: AuditBlock): { valid: boolean; reason: string | null } {
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
