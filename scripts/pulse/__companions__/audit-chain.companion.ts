/**
 * Verify the entire audit chain from genesis to tip.
 *
 * Walks forward block by block, checking:
 * - Each block's prevHash matches the previous block's computed hash
 * - Each block's signature is valid
 *
 * Any failures are recorded in `verificationFailures`.
 *
 * @param chain  The audit chain to verify.
 * @returns The same chain object with `verified`, `lastVerified`, and
 *          `verificationFailures` updated.
 */
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

/**
 * Verify a single block against its predecessor.
 *
 * Checks:
 * - If prevBlock is non-null, block.prevHash must match computeBlockHash(prevBlock)
 * - block.signature must be valid for the block's content
 *
 * @param block      The block to verify.
 * @param prevBlock  The previous block in the chain, or null for genesis.
 * @returns `true` if the block passes both checks.
 */
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

