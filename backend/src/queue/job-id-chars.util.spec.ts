import {
  coerceToInputString,
  isAllowedQueueIdChar,
  stripLeadingTrailingUnderscores,
} from './job-id-chars.util';

describe('coerceToInputString', () => {
  it('returns trimmed string for string input', () => {
    expect(coerceToInputString('  hello  ')).toBe('hello');
  });

  it('converts number to string', () => {
    expect(coerceToInputString(42)).toBe('42');
  });

  it('converts boolean to string', () => {
    expect(coerceToInputString(true)).toBe('true');
    expect(coerceToInputString(false)).toBe('false');
  });

  it('returns empty string for null', () => {
    expect(coerceToInputString(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(coerceToInputString(undefined)).toBe('');
  });

  it('returns empty string for objects', () => {
    expect(coerceToInputString({ key: 'value' })).toBe('');
  });

  it('returns empty string for arrays', () => {
    expect(coerceToInputString([1, 2, 3])).toBe('');
  });
});

describe('isAllowedQueueIdChar', () => {
  it('allows lowercase letters', () => {
    expect(isAllowedQueueIdChar('a')).toBe(true);
    expect(isAllowedQueueIdChar('z')).toBe(true);
  });

  it('allows uppercase letters', () => {
    expect(isAllowedQueueIdChar('A')).toBe(true);
    expect(isAllowedQueueIdChar('Z')).toBe(true);
  });

  it('allows digits', () => {
    expect(isAllowedQueueIdChar('0')).toBe(true);
    expect(isAllowedQueueIdChar('9')).toBe(true);
  });

  it('allows underscore', () => {
    expect(isAllowedQueueIdChar('_')).toBe(true);
  });

  it('allows hyphen', () => {
    expect(isAllowedQueueIdChar('-')).toBe(true);
  });

  it('rejects special characters', () => {
    expect(isAllowedQueueIdChar('!')).toBe(false);
    expect(isAllowedQueueIdChar('@')).toBe(false);
    expect(isAllowedQueueIdChar('#')).toBe(false);
    expect(isAllowedQueueIdChar(' ')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isAllowedQueueIdChar('')).toBe(false);
  });
});

describe('stripLeadingTrailingUnderscores', () => {
  it('strips leading underscores', () => {
    expect(stripLeadingTrailingUnderscores('___hello')).toBe('hello');
  });

  it('strips trailing underscores', () => {
    expect(stripLeadingTrailingUnderscores('hello___')).toBe('hello');
  });

  it('strips both leading and trailing underscores', () => {
    expect(stripLeadingTrailingUnderscores('___hello___')).toBe('hello');
  });

  it('returns empty string when only underscores', () => {
    expect(stripLeadingTrailingUnderscores('___')).toBe('');
  });

  it('preserves internal underscores', () => {
    expect(stripLeadingTrailingUnderscores('hello_world')).toBe('hello_world');
  });

  it('preserves string with no underscores', () => {
    expect(stripLeadingTrailingUnderscores('hello')).toBe('hello');
  });

  it('handles empty string', () => {
    expect(stripLeadingTrailingUnderscores('')).toBe('');
  });
});
