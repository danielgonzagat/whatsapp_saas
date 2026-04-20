import type { KeyboardEvent } from 'react';

/**
 * Activates Enter/Space for keyboard users on role="button" divs.
 * Returns true when activation occurred so callers can preventDefault.
 */
export function isActivationKey(event: KeyboardEvent): boolean {
  return event.key === 'Enter' || event.key === ' ';
}

/** Trigger click on activation. */
export function triggerClickOnActivation(event: KeyboardEvent<HTMLElement>): void {
  if (!isActivationKey(event)) {
    return;
  }
  event.preventDefault();
  (event.currentTarget as HTMLElement).click();
}

/** Resolve badge label. */
export function resolveBadgeLabel(
  badge: string | undefined,
  disabled: boolean | undefined,
): string | undefined {
  return disabled ? 'Planejado' : badge;
}

/** Resolve cursor. */
export function resolveCursor(
  interactive: boolean,
  disabled: boolean | undefined,
): 'pointer' | 'not-allowed' | 'default' {
  if (interactive) {
    return 'pointer';
  }
  if (disabled) {
    return 'not-allowed';
  }
  return 'default';
}
