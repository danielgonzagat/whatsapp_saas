import type { MerkleDag, MerkleNode, MerkleProof } from './types.merkle-cache';

export type { BuildMerkleDagOptions } from './__parts__/merkle-cache/internal-helpers';
export { buildMerkleDag } from './__parts__/merkle-cache/build-merkle-dag';
export { computeChangedNodes } from './__parts__/merkle-cache/affected-nodes';
export { getAffectedArtifacts } from './__parts__/merkle-cache/affected-nodes';
export { recomputeNode } from './__parts__/merkle-cache/recompute';
export { verifyDagIntegrity } from './__parts__/merkle-cache/verification-proofs';
export { generateProof } from './__parts__/merkle-cache/verification-proofs';
export { verifyProof } from './__parts__/merkle-cache/verification-proofs';
