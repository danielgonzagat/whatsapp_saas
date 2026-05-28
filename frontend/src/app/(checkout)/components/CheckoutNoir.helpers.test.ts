import { describe, expect, it } from 'vitest';
import {
  buildInputTheme,
  buildNoirColors,
  buildStepCardStyles,
  buildStepTheme,
  coerceInstallmentOptionsToString,
  paymentBadgeIsVisible,
  resolveStepBubbleState,
} from './CheckoutNoir.helpers';
import { DEFAULT_C } from './CheckoutNoir.defaults';

const baseDefaults = { ...DEFAULT_C };

describe('CheckoutNoir.helpers / buildNoirColors', () => {
  it('returns the defaults verbatim when config is undefined', () => {
    expect(buildNoirColors(undefined, baseDefaults)).toEqual(baseDefaults);
  });

  it('overrides only the fields the config provides', () => {
    const result = buildNoirColors(
      {
        backgroundColor: '#111',
        cardColor: '#222',
        textColor: '#fff',
        mutedTextColor: '#aaa',
        accentColor: '#f60',
      },
      baseDefaults,
    );
    expect(result.void).toBe('#111');
    expect(result.surface).toBe('#222');
    expect(result.text).toBe('#fff');
    expect(result.text2).toBe('#aaa');
    expect(result.accent).toBe('#f60');
    expect(result.accent2).toBe('#f60');
    expect(result.green).toBe(baseDefaults.green);
  });

  it('treats empty strings as missing config values', () => {
    const result = buildNoirColors(
      { backgroundColor: '', cardColor: '', accentColor: '' },
      baseDefaults,
    );
    expect(result.void).toBe(baseDefaults.void);
    expect(result.surface).toBe(baseDefaults.surface);
    expect(result.accent).toBe(baseDefaults.accent);
  });

  it('prefers accentColor2 when supplied and falls back to accentColor otherwise', () => {
    const both = buildNoirColors(
      { accentColor: '#f60', accentColor2: '#0af' },
      baseDefaults,
    );
    expect(both.accent2).toBe('#0af');
    const single = buildNoirColors({ accentColor: '#f60' }, baseDefaults);
    expect(single.accent2).toBe('#f60');
  });
});

describe('CheckoutNoir.helpers / buildStepTheme', () => {
  it('maps colour tokens into the step indicator surface', () => {
    const theme = buildStepTheme(baseDefaults);
    expect(theme).toEqual({
      activeBubbleBg: baseDefaults.accent,
      lockedBubbleBg: baseDefaults.surface2,
      activeLabelColor: baseDefaults.text,
      lockedLabelColor: baseDefaults.text3,
      activeShadow: `0 2px 12px ${baseDefaults.accent}4d`,
      lineActive: baseDefaults.green,
      lineInactive: baseDefaults.border2,
    });
  });
});

describe('CheckoutNoir.helpers / buildInputTheme', () => {
  it('returns the exact chrome the original component used', () => {
    expect(buildInputTheme(baseDefaults)).toEqual({
      background: baseDefaults.surface2,
      border: baseDefaults.border2,
      text: baseDefaults.text,
      radius: 6,
      focusBorder: baseDefaults.accent,
      focusShadow: `0 0 0 2px ${baseDefaults.accent}26`,
      tagStroke: baseDefaults.text3,
      editStroke: baseDefaults.text3,
    });
  });
});

describe('CheckoutNoir.helpers / buildStepCardStyles', () => {
  it('returns the six style bundles with the canonical static values', () => {
    const styles = buildStepCardStyles(baseDefaults);

    expect(styles.doneCard).toMatchObject({
      background: 'rgba(16,185,129,0.04)',
      borderRadius: 6,
      padding: 20,
    });
    expect(styles.doneCard.border).toBe(`1px solid ${baseDefaults.border}`);

    expect(styles.activeCard).toMatchObject({
      background: baseDefaults.surface,
      boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
      borderRadius: 6,
      padding: '24px 20px',
      animation: 'fadeIn 0.3s',
    });
    expect(styles.activeCard.border).toBe(`1px solid ${baseDefaults.border2}`);

    expect(styles.lockedCard).toMatchObject({
      background: baseDefaults.surface,
      borderRadius: 6,
      padding: '24px 20px',
      opacity: 0.35,
    });
    expect(styles.lockedCard.border).toBe(`1px solid ${baseDefaults.border}`);

    expect(styles.numDone).toMatchObject({
      width: 26,
      height: 26,
      borderRadius: '16%',
      background: baseDefaults.green,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    });
    expect(styles.numActive.background).toBe(baseDefaults.accent);
    expect(styles.numLock.background).toBe(baseDefaults.surface2);
  });
});

describe('CheckoutNoir.helpers / coerceInstallmentOptionsToString', () => {
  it('converts numeric values to strings while preserving every sibling field', () => {
    const input = [
      { value: 1, label: '1x', meta: 'foo' },
      { value: 12, label: '12x', extra: { nested: true } },
    ];
    const out = coerceInstallmentOptionsToString(input);
    expect(out).toEqual([
      { value: '1', label: '1x', meta: 'foo' },
      { value: '12', label: '12x', extra: { nested: true } },
    ]);
  });

  it('is a no-op for already-string values', () => {
    expect(coerceInstallmentOptionsToString([{ value: '3', label: '3x' }])).toEqual([
      { value: '3', label: '3x' },
    ]);
  });
});

describe('CheckoutNoir.helpers / paymentBadgeIsVisible', () => {
  const yes = { supportsCard: true, supportsPix: true, supportsBoleto: true };
  const no = { supportsCard: false, supportsPix: false, supportsBoleto: false };

  it('gates Pix on supportsPix', () => {
    expect(paymentBadgeIsVisible('Pix', yes)).toBe(true);
    expect(paymentBadgeIsVisible('Pix', { ...yes, supportsPix: false })).toBe(false);
  });

  it('gates Boleto on supportsBoleto', () => {
    expect(paymentBadgeIsVisible('Boleto', yes)).toBe(true);
    expect(paymentBadgeIsVisible('Boleto', { ...yes, supportsBoleto: false })).toBe(false);
  });

  it('falls back to supportsCard for every other badge', () => {
    expect(paymentBadgeIsVisible('VISA', yes)).toBe(true);
    expect(paymentBadgeIsVisible('VISA', { ...yes, supportsCard: false })).toBe(false);
    expect(paymentBadgeIsVisible('AMEX', no)).toBe(false);
  });
});

describe('CheckoutNoir.helpers / resolveStepBubbleState', () => {
  it('treats step 3 as active iff step >= 3 and never marks it done', () => {
    expect(resolveStepBubbleState(2, 3)).toBe('locked');
    expect(resolveStepBubbleState(3, 3)).toBe('active');
    expect(resolveStepBubbleState(4, 3)).toBe('active');
  });

  it('returns active / done / locked for steps 1 and 2 around the cursor', () => {
    expect(resolveStepBubbleState(1, 1)).toBe('active');
    expect(resolveStepBubbleState(2, 1)).toBe('done');
    expect(resolveStepBubbleState(3, 1)).toBe('done');

    expect(resolveStepBubbleState(1, 2)).toBe('locked');
    expect(resolveStepBubbleState(2, 2)).toBe('active');
    expect(resolveStepBubbleState(3, 2)).toBe('done');
  });
});
