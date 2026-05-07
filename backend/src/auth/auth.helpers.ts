import { UnauthorizedException } from '@nestjs/common';

/** Regex used by anonymous-uid generation to strip dashes from a UUID. */
export const PATTERN_RE = /-/g;

/** Build a structured log line for auth events. */
export function buildAuthLogMessage(event: string, payload: Record<string, unknown>): string {
  return JSON.stringify({ ...payload, event });
}

/** Normalize an email to its canonical lookup form. */
export function normalizeEmail(email: string): string {
  return String(email || '')
    .trim()
    .toLowerCase();
}

/** Throw a friendly UnauthorizedException when an agent is not allowed to sign in. */
export function assertAgentCanAuthenticate(agent: {
  disabledAt?: Date | null;
  deletedAt?: Date | null;
}): void {
  if (agent.deletedAt) {
    throw new UnauthorizedException('Esta conta foi excluída.');
  }
  if (agent.disabledAt) {
    throw new UnauthorizedException('Esta conta está temporariamente desativada.');
  }
}
