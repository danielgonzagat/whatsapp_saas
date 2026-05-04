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
export { computeBlockHash } from './__parts__/audit-chain/hashing';
export {
  buildAuditChain,
  appendBlock,
  verifyChain,
  verifyBlock,
} from './__parts__/audit-chain/main';
