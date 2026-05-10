import * as path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { appendTextFile, ensureDir, pathExists, readTextFile, writeTextFile } from '../../safe-fs';
import { resolveRoot } from '../../lib/safe-path';
import type { AuditBlock, AuditChain } from '../../types.audit-chain';
import {
  computeBlockHash,
  computeDecisionHash,
  computeLegacyDecisionHash,
  signBlock,
  verifySignature,
} from './hashing';

const AUDIT_CHAIN_FILENAME = 'PULSE_AUDIT_CHAIN.jsonl';
const AUDIT_CHAIN_ID_FILENAME = 'PULSE_AUDIT_CHAIN_ID.txt';
const HASH_ALGORITHM = 'sha256';
const ZERO_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

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

export function verifyChain(chain: AuditChain): AuditChain {
  const failures: AuditChain['verificationFailures'] = [];

  for (let i = 0; i < chain.blocks.length; i++) {
    const block = chain.blocks[i];
    const prevBlock = i > 0 ? chain.blocks[i - 1] : null;

    const blockVerification = verifyBlockDetailed(block, prevBlock);
    if (!blockVerification.valid) {
      let reason = `Block ${i} failed verification`;
      if (prevBlock) {
        const expectedPrevHash = computeBlockHash(prevBlock);
        if (block.prevHash !== expectedPrevHash) {
          reason = `Block ${i} prevHash mismatch: expected ${expectedPrevHash.slice(0, 16)}..., got ${block.prevHash.slice(0, 16)}...`;
        }
      }
      if (blockVerification.reason) {
        reason = `Block ${i} ${blockVerification.reason}`;
      }
      failures.push({ blockIndex: i, reason });
    }
  }

  return {
    ...chain,
    verified: failures.length === 0,
    lastVerified: new Date().toISOString(),
    verificationFailures: failures,
  };
}

export function verifyBlock(block: AuditBlock, prevBlock: AuditBlock | null): boolean {
  return verifyBlockDetailed(block, prevBlock).valid;
}

function verifyBlockDetailed(
  block: AuditBlock,
  prevBlock: AuditBlock | null,
): { valid: boolean; reason: string | null } {
  if (!Number.isInteger(block.index) || block.index < 0) {
    return { valid: false, reason: 'index invalid' };
  }

  const expectedIndex = prevBlock ? prevBlock.index + 1 : 0;
  if (block.index !== expectedIndex) {
    return {
      valid: false,
      reason: `index mismatch: expected ${expectedIndex}, got ${block.index}`,
    };
  }

  if (prevBlock) {
    const expectedPrevHash = computeBlockHash(prevBlock);
    if (block.prevHash !== expectedPrevHash) {
      return { valid: false, reason: 'prevHash mismatch' };
    }
  } else if (block.prevHash !== ZERO_HASH) {
    return { valid: false, reason: 'genesis prevHash must be zero hash' };
  }

  if (Number.isNaN(Date.parse(block.timestamp))) {
    return { valid: false, reason: 'timestamp invalid' };
  }

  const canonicalDecisionHash = computeDecisionHash(block.metadata);
  const legacyDecisionHash = computeLegacyDecisionHash(block.metadata);
  const legacyGenesisDecisionHash = createHash(HASH_ALGORITHM).update('genesis').digest('hex');
  const decisionHashMatches =
    block.decisionHash === canonicalDecisionHash ||
    block.decisionHash === legacyDecisionHash ||
    (block.index === 0 && block.decisionHash === legacyGenesisDecisionHash);

  if (!decisionHashMatches) {
    return { valid: false, reason: 'decisionHash mismatch' };
  }

  const signatureVerification = verifySignature(block);
  if (!signatureVerification.valid) {
    return signatureVerification;
  }

  return { valid: true, reason: null };
}
