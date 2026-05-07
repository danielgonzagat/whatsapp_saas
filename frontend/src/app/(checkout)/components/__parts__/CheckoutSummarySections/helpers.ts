import type { CheckoutVisualTheme } from '../../checkout-theme-tokens';

export const STAR_SLOTS = ['one', 'two', 'three', 'four', 'five'] as const;

export function summaryToggle(theme: CheckoutVisualTheme) {
  return {
    width: '100%',
    padding: '16px 20px',
    background: 'transparent',
    border: 'none',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    color: theme.text,
  } satisfies React.CSSProperties;
}

export function summaryLine(theme: CheckoutVisualTheme) {
  return {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 15,
    fontWeight: 700,
    color: theme.text,
    marginBottom: 8,
  } satisfies React.CSSProperties;
}

export function quantityButton(theme: CheckoutVisualTheme) {
  return {
    padding: '8px 18px',
    background: 'transparent',
    border: 'none',
    color: theme.mutedText,
    display: 'flex',
    alignItems: 'center',
  } satisfies React.CSSProperties;
}
