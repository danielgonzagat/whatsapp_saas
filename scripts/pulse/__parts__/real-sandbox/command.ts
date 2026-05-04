import type { RealSandboxCommandPlan, RealSandboxBlockedReason } from './types';
import { DESTRUCTIVE_COMMAND_RE, APPROVED_COMMAND_RE, VALIDATION_COMMAND_RE } from './types';
import { normalizeCommand } from './path';

export function classifyCommand(command: string): {
  command: string;
  plan: RealSandboxCommandPlan | null;
  blockedReason: RealSandboxBlockedReason | null;
} {
  const normalized = normalizeCommand(command);
  if (DESTRUCTIVE_COMMAND_RE.test(normalized)) {
    return {
      command: normalized,
      plan: null,
      blockedReason: {
        code: 'destructive_command',
        target: normalized,
        reason:
          'Command is destructive or can mutate git, database, migrations, or filesystem state.',
      },
    };
  }

  if (!APPROVED_COMMAND_RE.test(normalized)) {
    return {
      command: normalized,
      plan: null,
      blockedReason: {
        code: 'unapproved_command',
        target: normalized,
        reason: 'Only read-only git inspection and validation/PULSE commands are allowed.',
      },
    };
  }

  return {
    command: normalized,
    plan: {
      command: normalized,
      kind: VALIDATION_COMMAND_RE.test(normalized) ? 'validation' : 'read_only',
    },
    blockedReason: null,
  };
}
