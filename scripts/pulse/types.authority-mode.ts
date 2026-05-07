/**
 * Unified AuthorityMode enumeration for PULSE.
 * Used by both CLI and runtime to represent operational authority levels.
 */

export type AuthorityMode =
  | 'advisory-only'
  | 'operator-gated'
  | 'autonomous-execution'
  | 'certified-autonomous';

export const AUTHORITY_MODES = [
  'advisory-only',
  'operator-gated',
  'autonomous-execution',
  'certified-autonomous',
] as const satisfies readonly AuthorityMode[];

/**
 * Type guard to validate if a value is a valid AuthorityMode.
 */
export function isAuthorityMode(value: unknown): value is AuthorityMode {
  return typeof value === 'string' && AUTHORITY_MODES.includes(value as AuthorityMode);
}
