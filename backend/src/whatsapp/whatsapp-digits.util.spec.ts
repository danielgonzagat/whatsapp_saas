import { isDigit, collapseWhitespace, extractAsciiDigits } from './whatsapp-digits.util';

describe('isDigit', () => {
  it('returns true for digit characters 0-9', () => {
    expect(isDigit('0')).toBe(true);
    expect(isDigit('5')).toBe(true);
    expect(isDigit('9')).toBe(true);
  });

  it('returns false for non-digit characters', () => {
    expect(isDigit('a')).toBe(false);
    expect(isDigit('A')).toBe(false);
    expect(isDigit(' ')).toBe(false);
    expect(isDigit('.')).toBe(false);
    expect(isDigit('')).toBe(false);
  });
});

describe('collapseWhitespace', () => {
  it('collapses multiple whitespace into single spaces and trims', () => {
    expect(collapseWhitespace('  hello   world  ')).toBe('hello world');
  });

  it('returns trimmed string for single value', () => {
    expect(collapseWhitespace('  hello  ')).toBe('hello');
  });

  it('handles numbers and booleans by coercing to string', () => {
    expect(collapseWhitespace(42)).toBe('42');
    expect(collapseWhitespace(true)).toBe('true');
  });

  it('returns empty string for null, undefined, objects', () => {
    expect(collapseWhitespace(null)).toBe('');
    expect(collapseWhitespace(undefined)).toBe('');
    expect(collapseWhitespace({})).toBe('');
  });
});

describe('extractAsciiDigits', () => {
  it('extracts digits from a string', () => {
    expect(extractAsciiDigits('abc123def456')).toBe('123456');
  });

  it('returns only digits, ignoring all other characters', () => {
    expect(extractAsciiDigits('+1 (234) 567-890')).toBe('1234567890');
  });

  it('returns empty string when no digits present', () => {
    expect(extractAsciiDigits('abcdef')).toBe('');
  });

  it('handles numbers by coercing to string', () => {
    expect(extractAsciiDigits(12345)).toBe('12345');
  });

  it('returns empty string for null, undefined, objects', () => {
    expect(extractAsciiDigits(null)).toBe('');
    expect(extractAsciiDigits(undefined)).toBe('');
    expect(extractAsciiDigits({})).toBe('');
  });
});
