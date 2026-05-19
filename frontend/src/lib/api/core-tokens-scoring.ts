import {
  decodeKloelJwtPayload,
  hasAuthenticatedKloelToken,
  isAnonymousKloelToken,
} from '@/lib/auth-identity';

function tokenAuthenticatedScore(token: string): number {
  return hasAuthenticatedKloelToken(token) ? 1000 : 0;
}

function tokenAnonymousPenalty(token: string): number {
  return isAnonymousKloelToken(token) ? -1000 : 0;
}

function tokenNameScore(payload: Record<string, unknown> | null | undefined): number {
  return String(payload?.name || '').trim() ? 100 : 0;
}

function tokenExpScore(payload: Record<string, unknown> | null | undefined): number {
  const exp = payload?.exp;
  return typeof exp === 'number' ? exp : 0;
}

function scoreTokenCandidate(token: string): number {
  const payload = decodeKloelJwtPayload(token);
  return (
    tokenAuthenticatedScore(token) +
    tokenAnonymousPenalty(token) +
    tokenNameScore(payload) +
    tokenExpScore(payload)
  );
}

export function pickBestTokenCandidate(candidates: string[]): string | null {
  return (
    [...candidates].sort(
      (left, right) => scoreTokenCandidate(right) - scoreTokenCandidate(left),
    )[0] || null
  );
}
