import { UnauthorizedException } from '@nestjs/common';
import { UUID_DASH_RE } from '../common/regex';

export { UUID_DASH_RE };

/** Build a structured log line for auth events. */
export function buildAuthLogMessage(event: string, payload: Record<string, unknown>): string {
  return JSON.stringify({ ...payload, event });
}

/** Normalize an email to its canonical lookup form. */
import { normalizeEmail } from '../common/string';
export { normalizeEmail };

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
