import * as crypto from 'node:crypto';

export interface NegativeActionProof {
  verdict: 'NEGATIVE_BYTES_ADMITTED';
  action: string;
  target: string;
  targetUnit: string;
  removedByteCount: number;
  proofLength: number;
  proofSha256: string;
  proof: string;
}

export interface NegativeActionProofRequest {
  action: string;
  target: string;
  targetUnit: string;
  removedByteCount: number;
  proofOfIncorrectness?: string;
}

const MIN_PROOF_CHARS = 20;
const sha256 = (value: string): string => crypto.createHash('sha256').update(value).digest('hex');

export function removedByteCountBetween(before: string, after: string): number {
  const beforeBytes = Buffer.from(before, 'utf8');
  const afterBytes = Buffer.from(after, 'utf8');
  let start = 0;
  while (
    start < beforeBytes.length &&
    start < afterBytes.length &&
    beforeBytes[start] === afterBytes[start]
  ) {
    start += 1;
  }
  let beforeEnd = beforeBytes.length;
  let afterEnd = afterBytes.length;
  while (
    beforeEnd > start &&
    afterEnd > start &&
    beforeBytes[beforeEnd - 1] === afterBytes[afterEnd - 1]
  ) {
    beforeEnd -= 1;
    afterEnd -= 1;
  }
  return Math.max(0, beforeEnd - start);
}

export function requireNegativeActionProof(request: NegativeActionProofRequest): NegativeActionProof {
  const proof = (request.proofOfIncorrectness ?? '').trim();
  if (proof.length < MIN_PROOF_CHARS) {
    throw new Error(
      'refused: ' +
        request.action +
        ' is a negative byte action on ' +
        request.target +
        '; provide proofOfIncorrectness (>=20 chars) explaining why the affected bytes are non-correct/negative. ' +
        'Correct-by-construction bytes are immutable to negative actions.',
    );
  }
  const removedByteCount = Math.max(0, Math.floor(request.removedByteCount));
  if (removedByteCount <= 0) {
    throw new Error(
      'refused: ' +
        request.action +
        ' did not identify any negative bytes under target ' +
        request.target +
        '; negative actions must bind to a non-empty byte effect.',
    );
  }
  return {
    verdict: 'NEGATIVE_BYTES_ADMITTED',
    action: request.action,
    target: request.target,
    targetUnit: request.targetUnit,
    removedByteCount,
    proofLength: proof.length,
    proofSha256: sha256(proof),
    proof,
  };
}


export interface NegativeReplacementProofRequest {
  action: string;
  target: string;
  targetUnit: string;
  before: string;
  after: string;
  proofOfIncorrectness?: string;
  preview?: boolean;
}

export function requireNegativeProofForRemovedBytes(
  request: NegativeReplacementProofRequest,
): NegativeActionProof | undefined {
  if (request.preview) return undefined;
  const removedByteCount = removedByteCountBetween(request.before, request.after);
  if (removedByteCount <= 0) return undefined;
  return requireNegativeActionProof({
    action: request.action,
    target: request.target,
    targetUnit: request.targetUnit,
    removedByteCount,
    proofOfIncorrectness: request.proofOfIncorrectness,
  });
}
